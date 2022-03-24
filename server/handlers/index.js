import { createClient } from "./client";
import { getNextCustomerOrderHistory } from "./queries/get-customer-order-history";
import { getPreviousCustomerOrderHistory } from "./queries/get-customer-order-history-previous";
import { getCustomerTags } from "./queries/get-customer-tags";

export {
  createClient,
  getNextCustomerOrderHistory,
  getPreviousCustomerOrderHistory,
  getCustomerTags,
};
