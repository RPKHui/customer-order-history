import "isomorphic-fetch";
import { gql } from "apollo-boost";

const GET_CUSTOMER_TAGS = gql`
  query GetCustomerTags($customerId: ID!) {
    customer(id: $customerId) {
      id
      tags
    }
  }
`;

export const getCustomerTags = async (client, payload) => {
  const { customerId } = payload;

  const customerGid = `gid://shopify/Customer/${customerId}`;

  return client
    .query({ query: GET_CUSTOMER_TAGS, variables: { customerId: customerGid } })
    .then((response) => {
      const { data } = response;

      return data.customer;
    });
};
