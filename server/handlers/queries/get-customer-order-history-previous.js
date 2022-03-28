import "isomorphic-fetch";
import { gql } from "apollo-boost";

const GET_CUSTOMER_ORDER_HISTORY = gql`
  query GetCustomerOrderHistory($query: String!, $cursor: String) {
    orders(last: 10, query: $query, before: $cursor) {
      pageInfo {
        hasNextPage
        hasPreviousPage
      }
      edges {
        cursor
        node {
          id
          legacyResourceId
          name
          createdAt
          tags
          displayFinancialStatus
          displayFulfillmentStatus
          shippingAddress {
            address1
            address2
            formattedArea
          }
          totalRefundedSet {
            shopMoney {
              amount
            }
          }
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          note
        }
      }
    }
  }
`;

export const getPreviousCustomerOrderHistory = async (client, payload) => {
  const { vendorName, cursor, deliveryDate } = payload;

  return client
    .query({
      query: GET_CUSTOMER_ORDER_HISTORY,
      variables: { query: `tag:'${vendorName}' AND '${deliveryDate}'`, cursor },
    })
    .then((response) => {
      const { data } = response;

      return data.orders;
    });
};
