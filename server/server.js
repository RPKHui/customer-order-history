import "@babel/polyfill";
import dotenv from "dotenv";
import "isomorphic-fetch";
import createShopifyAuth, { verifyRequest } from "@shopify/koa-shopify-auth";
import {
  createClient,
  getCustomerTags,
  getNextCustomerOrderHistory,
  getPreviousCustomerOrderHistory,
} from "./handlers";
import Shopify, { ApiVersion } from "@shopify/shopify-api";
import Koa from "koa";
import koaBody from "koa-bodyparser";
import next from "next";
import Router from "koa-router";
import { verifyAppProxyExtensionSignature } from "./utilities";

dotenv.config();
// const port = parseInt(process.env.PORT, 10) || 8081;
const dev = process.env.NODE_ENV !== "production";
const app = next({
  dev,
});
const handle = app.getRequestHandler();

Shopify.Context.initialize({
  API_KEY: process.env.SHOPIFY_API_KEY,
  API_SECRET_KEY: process.env.SHOPIFY_API_SECRET,
  SCOPES: process.env.SCOPES.split(","),
  HOST_NAME: process.env.HOST.replace(/https:\/\/|\/$/g, ""),
  API_VERSION: ApiVersion.October20,
  IS_EMBEDDED_APP: true,
  // This should be replaced with your preferred storage strategy
  SESSION_STORAGE: new Shopify.Session.MemorySessionStorage(),
});

// Storing the currently active shops in memory will force them to re-login when your server restarts. You should
// persist this object in your app.
const ACTIVE_SHOPIFY_SHOPS = {};

Shopify.Webhooks.Registry.addHandler("APP_UNINSTALLED", {
  path: "/webhooks",
  webhookHandler: async (topic, shop, body) =>
    delete ACTIVE_SHOPIFY_SHOPS[shop],
});

app.prepare().then(async () => {
  const server = new Koa();
  const router = new Router();
  server.keys = [Shopify.Context.API_SECRET_KEY];
  server.use(
    createShopifyAuth({
      accessMode: "online",
      prefix: "/online",
      async afterAuth(ctx) {
        // Online access mode access token and shop available in ctx.state.shopify
        const { shop } = ctx.state.shopify;

        // Redirect to app with shop parameter upon auth
        ctx.redirect(
          `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`
        );
      },
    })
  );

  // Shopify API "offline" access mode tokens are meant for long term access to a store,
  // where no user interaction is involved is ideal for background work in response to webhooks,
  // or for maintenance work in backgrounded jobs.
  server.use(
    createShopifyAuth({
      accessMode: "offline",
      prefix: "/offline",
      async afterAuth(ctx) {
        // Offline access mode access token and shop available in ctx.state.shopify
        const { shop, accessToken, scope } = ctx.state.shopify;

        ACTIVE_SHOPIFY_SHOPS[shop] = scope;

        let response = await Shopify.Webhooks.Registry.register({
          shop,
          accessToken,
          path: "/webhooks",
          topic: "APP_UNINSTALLED",
          webhookHandler: async (topic, shop, body) =>
            delete ACTIVE_SHOPIFY_SHOPS[shop],
        });

        if (!response.success) {
          console.log(
            `Failed to register APP_UNINSTALLED webhook: ${response.result}`
          );
        }

        // Redirect to online auth entry point to create
        // an online access mode token that will be used by the embedded app
        ctx.redirect(`/online/auth/?shop=${shop}`);
      },
    })
  );

  const handleRequest = async (ctx) => {
    await handle(ctx.req, ctx.res);
    ctx.respond = false;
    ctx.res.statusCode = 200;
  };

  const verifyIfActiveShopifyShop = (ctx, next) => {
    const { shop } = ctx.query;

    // This shop hasn't been seen yet, go through OAuth to create a session
    if (ACTIVE_SHOPIFY_SHOPS[shop] === undefined) {
      ctx.redirect(`/offline/auth?shop=${shop}`);
      return;
    }

    return next();
  };

  const verifyAppProxyExtensionSignatureMiddleware = (ctx, next) => {
    if (
      verifyAppProxyExtensionSignature(
        ctx.query,
        process.env.SHOPIFY_API_SECRET
      )
    ) {
      return next();
    }
    ctx.res.statusCode = 401;
  };

  router.post("/webhooks", async (ctx) => {
    try {
      await Shopify.Webhooks.Registry.process(ctx.req, ctx.res);
      console.log(`Webhook processed, returned status code 200`);
    } catch (error) {
      console.log(`Failed to process webhook: ${error}`);
    }
  });

  router.post(
    "/graphql",
    verifyRequest({ returnHeader: true }),
    async (ctx, next) => {
      await Shopify.Utils.graphqlProxy(ctx.req, ctx.res);
    }
  );

  const getCustomerOrders = async (ctx) => {
    // We shouldn't trust user's input.
    // We need to verify whether this request is coming from Shopify,
    // see the `verifyAppProxyExtensionSignatureMiddleware` middleware function
    const { shop } = ctx.query;

    // Note that loadOfflineSession should not take the shop name
    // from user input as it assumes the request is coming from your app's backend.
    //
    // Hence why the signature query param or the checkout post-purchase token are
    // verified before loading the offline session.
    //
    // We need offline access mode token here in order to call the Shopify Admin API
    const session = await Shopify.Utils.loadOfflineSession(shop);

    if (!session) {
      ctx.res.statusCode = 403;
      return;
    }

    const client = createClient(session.shop, session.accessToken);

    const fetchOptions = {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": session.accessToken,
        "User-Agent": `shopify-app-node ${process.env.npm_package_version} | Shopify App CLI`,
      },
    };

    try {
      // the customerId will be in the request body, taken from the dataset
      // get the vendor's tags by calling the api
      const { tags } = await getCustomerTags(client, ctx.request.body);

      // get the VendorName tag from the tags
      const vendorNameTag = tags.filter((tag) => tag.includes("VendorName"))[0];

      // get the vendor name
      const vendorName = vendorNameTag.split("-")[1];

      // determine if we are doing next page or previous page
      // use the correct graphql call
      const { toNextPage } = ctx.request.body;
      const orders = toNextPage
        ? await getNextCustomerOrderHistory(client, {
            vendorName,
            ...ctx.request.body,
          })
        : await getPreviousCustomerOrderHistory(client, {
            vendorName,
            ...ctx.request.body,
          });

      // if orders are empty then we don't have to
      // fetch the order status urls and append them
      let orderData;

      if (orders.edges.length > 0) {
        const legacyResourceIds = [];
        // extract the legacyResource ids from the order
        for (let i = 0; i < orders.edges.length; i++) {
          legacyResourceIds.push(orders.edges[i].node.legacyResourceId);
        }

        const legacyResourceIdsString = legacyResourceIds.join(",");

        const orderUrls = await fetch(
          `https://${session.shop}/admin/api/2019-10/orders.json?` +
            new URLSearchParams({
              ids: legacyResourceIdsString,
              fields: "id,order_status_url",
            }),
          fetchOptions
        );

        orderData = await orderUrls.json();

        // append order status url to the graphql return object
        for (let i = 0; i < orderData.orders.length; i++) {
          let order = orders.edges.find(
            (edge) =>
              edge.node.legacyResourceId === orderData.orders[i].id.toString()
          );
          order.node.orderStatusUrl = orderData.orders[i]["order_status_url"];
        }
      }

      // return using ctx.body and settings the ctx.res.statusCode to 200
      ctx.body = JSON.stringify({
        tags,
        orders,
        orderData,
      });
      ctx.res.statusCode = 200;
    } catch (err) {
      console.log(err);
      ctx.res.statusCode = 500;
    }
  };

  router.post(
    "/api/customerorders",
    verifyAppProxyExtensionSignatureMiddleware,
    koaBody(),
    getCustomerOrders
  );

  router.get("(/_next/static/.*)", handleRequest); // Static content is clear
  router.get("/_next/webpack-hmr", handleRequest); // Webpack content is clear

  // Embedded app Next.js entry point
  router.get("(.*)", verifyIfActiveShopifyShop, handleRequest);

  server.use(router.allowedMethods());
  server.use(router.routes());
  server.listen(process.env.PORT || 3000, () => {
    console.log(`> Ready on http://localhost:${process.env.PORT || 3000}`);
  });
});
