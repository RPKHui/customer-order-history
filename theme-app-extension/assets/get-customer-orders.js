(function () {
  // takes in cursor and whether its next page
  function getCustomerOrders(deliveryDate, cursor, toNextPage) {
    const element = document.querySelector("#customer-data");
    const customerId = element.dataset.customerId;

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerId,
        toNextPage,
        cursor,
        deliveryDate,
      }),
    };

    return fetch("/apps/chapp/customerorders", fetchOptions);
  }

  function create({
    tag,
    appendTo,
    children = [],
    attributes = {},
    events = {},
  }) {
    const element = document.createElement(tag);

    Object.entries(attributes).forEach(([key, value]) => {
      element[key] = value;
    });

    Object.entries(events).forEach(([key, value]) => {
      element.addEventListener(key, value);
    });

    if (appendTo) {
      appendTo.appendChild(element);
    }

    children.forEach((child) => element.appendChild(child));

    return element;
  }

  function createRow(order) {
    // create the table row
    const row = create({ tag: "tr" });

    // order number, order date, delivery date, payment status
    // fulfillment status, total, delivery address, refund amount, note

    // for each attribute, we need to insert the table data
    // add info to textContent

    // create anchor tag for order number to link
    // to order status page for that order
    const orderStatusAnchor = create({
      tag: "a",
      attributes: {
        href: order.orderStatusUrl,
        target: "_blank",
        textContent: order.name,
      },
    });

    // order number
    create({
      tag: "td",
      children: [orderStatusAnchor],
      appendTo: row,
    });

    // order date
    // this changes it to AEDT
    const isoDate = new Date(order.createdAt);
    const dateString = isoDate.toDateString().split(" ").splice(1);

    // add a comma to the date for formatting/consistency purposes
    dateString[1] = dateString[1] + ",";

    const formattedDate = dateString.join(" ");

    create({
      tag: "td",
      attributes: {
        textContent: formattedDate,
      },
      appendTo: row,
    });

    // delivery date
    const { deliveryDate } = order;
    const deliveryDateString = deliveryDate.toDateString().split(" ").splice(1);

    // add a comma to the date for formatting/consistency purposes
    deliveryDateString[1] = deliveryDateString[1] + ",";

    const formattedDeliveryDate = deliveryDateString.join(" ");

    create({
      tag: "td",
      attributes: {
        textContent: formattedDeliveryDate,
      },
      appendTo: row,
    });

    // payment status
    const paymentStatus =
      order.displayFinancialStatus[0] +
      order.displayFinancialStatus.substring(1).toLowerCase();

    create({
      tag: "td",
      attributes: {
        textContent: paymentStatus,
      },
      appendTo: row,
    });

    // fulfillment status
    const fulfillmentStatus =
      order.displayFulfillmentStatus[0] +
      order.displayFulfillmentStatus.substring(1).toLowerCase();

    create({
      tag: "td",
      attributes: {
        textContent: fulfillmentStatus,
      },
      appendTo: row,
    });
    // total
    const total = order.totalPriceSet.shopMoney.amount;
    const formattedTotal = `$${total} AUD`;

    create({
      tag: "td",
      attributes: {
        textContent: formattedTotal,
      },
      appendTo: row,
    });

    // delivery address
    const { address1, address2, formattedArea } = order.shippingAddress;
    const formattedAddress = `${address2}/${address1}\n${formattedArea}`;

    create({
      tag: "td",
      attributes: {
        textContent: formattedAddress,
      },
      appendTo: row,
    });

    // refund amount
    const refund = order.totalRefundedSet.shopMoney.amount;
    const formattedRefund = `$${refund} AUD`;

    create({
      tag: "td",
      attributes: {
        textContent: formattedRefund,
      },
      appendTo: row,
    });

    create({
      tag: "td",
      attributes: {
        textContent: order.note,
      },
      appendTo: row,
    });

    return row;
  }

  function createTable(orders) {
    // select the container
    const container = document.querySelector("#cust-order-table");

    // loop through and create the rows
    const tableRows = [];

    orders.forEach((order) => {
      tableRows.push(createRow(order.node));
    });

    // create the table body and append all tablerows
    create({
      tag: "tbody",
      attributes: {
        id: "order-history-body",
      },
      children: tableRows,
      appendTo: container,
    });
  }

  function createPaginationButtons(orders) {
    // create the prev and next buttons
    const buttonsDiv = document.querySelector("#nav_btns");
    create({
      tag: "button",
      attributes: {
        textContent: "Previous",
        type: "button",
        disabled: !orders.pageInfo.hasPreviousPage,
      },
      events: {
        click: async (event) => {
          event.preventDefault();

          // remove the buttons from the buttons div container
          while (buttonsDiv.hasChildNodes()) {
            buttonsDiv.removeChild(buttonsDiv.firstChild);
          }

          // remove the table body
          const tableBody = document.getElementById("order-history-body");
          tableBody.parentNode.removeChild(tableBody);

          // fetch and populate again with previous cursor and bool
          fetchAndPopulateTable(
            (deliveryDate = sessionStorage.getItem("deliveryDate")),
            (cursor = sessionStorage.getItem("firstCursor")),
            (toNextPage = false)
          );
        },
      },
      appendTo: buttonsDiv,
    });

    create({
      tag: "button",
      attributes: {
        textContent: "Next",
        type: "button",
        disabled: !orders.pageInfo.hasNextPage,
      },
      events: {
        click: async (event) => {
          event.preventDefault();

          // remove the buttons from the buttons div container
          while (buttonsDiv.hasChildNodes()) {
            buttonsDiv.removeChild(buttonsDiv.firstChild);
          }

          // remove the table body
          const tableBody = document.getElementById("order-history-body");
          tableBody.parentNode.removeChild(tableBody);

          // fetch and populate again with previous cursor and bool
          fetchAndPopulateTable(
            (deliveryDate = sessionStorage.getItem("deliveryDate")),
            (cursor = sessionStorage.getItem("lastCursor")),
            (toNextPage = true)
          );
        },
      },
      appendTo: buttonsDiv,
    });
  }

  function createDatePicker() {
    const dateContainer = document.querySelector("#date-picker");

    // create the form
    const form = create({
      tag: "form",
      events: {
        submit: async (event) => {
          event.preventDefault();

          // get the chosen delivery date value
          const dateValue = event.target.delivery_date.value;
          if (dateValue) {
            // select submit button and disable it
            // only if there is a valid date value
            const submitBtn = document.querySelector("#delivery_date_btn");
            submitBtn.disabled = true;

            // parse the value into the required format
            const dateString = new Date(dateValue).toDateString();
            const [dayOfWeek, month, day, year] = dateString.split(" ");
            const deliveryDate = `${dayOfWeek} ${day} ${month} ${year}`;

            // clear the session storage of date, first and last cursor
            clearSessionStorage();

            // set the delivery date in session storage
            sessionStorage.setItem("deliveryDate", deliveryDate);

            // remove table body and nav buttons
            const tableBody = document.getElementById("order-history-body");
            if (tableBody) {
              tableBody.parentNode.removeChild(tableBody);
            }

            const buttonsDiv = document.querySelector("#nav_btns");
            while (buttonsDiv.hasChildNodes()) {
              buttonsDiv.removeChild(buttonsDiv.firstChild);
            }

            const messageContainer = document.querySelector("#empty-order-msg");
            while (messageContainer.hasChildNodes()) {
              messageContainer.removeChild(messageContainer.firstChild);
            }

            // fetch and populate the order history table
            fetchAndPopulateTable(deliveryDate);
          }
        },
      },
      appendTo: dateContainer,
    });
    // create the date input and label
    create({
      tag: "label",
      attributes: {
        for: "delivery_date",
        textContent: "Choose a delivery date:",
      },
      appendTo: form,
    });

    create({
      tag: "input",
      attributes: {
        type: "date",
        id: "delivery_date",
        name: "delivery_date",
      },
      appendTo: form,
    });

    create({
      tag: "input",
      attributes: {
        type: "submit",
        value: "Select Date",
        id: "delivery_date_btn",
      },
      appendTo: form,
    });
  }

  function clearSessionStorage() {
    if (sessionStorage.getItem("firstCursor")) {
      sessionStorage.removeItem("firstCursor");
    }
    if (sessionStorage.getItem("lastCursor")) {
      sessionStorage.removeItem("lastCursor");
    }
    if (sessionStorage.getItem("deliveryDate")) {
      sessionStorage.removeItem("deliveryDate");
    }
  }

  // fetches data given a cursor, whether its a next or previous page and a date(mandatory field)
  // populates the order history table
  async function fetchAndPopulateTable(
    deliveryDate,
    cursor = null,
    toNextPage = true
  ) {
    const customerOrders = await getCustomerOrders(
      deliveryDate,
      cursor,
      toNextPage
    );
    const result = await customerOrders.json();

    const { orders, orderData } = result;
    console.log(orderData);

    // if there are no orders on that date
    if (orders.edges.length == 0) {
      // early return with a message
      const messageContainer = document.querySelector("#empty-order-msg");

      create({
        tag: "p",
        attributes: {
          textContent: "There are no orders for this date",
        },
        appendTo: messageContainer,
      });

      // select submit button and enable it
      const submitBtn = document.querySelector("#delivery_date_btn");
      submitBtn.disabled = false;

      return;
    }
    const firstOrder = orders.edges[0];
    const lastOrder = orders.edges.slice(-1)[0];

    // setting the cursors in the session storage
    sessionStorage.setItem("firstCursor", firstOrder.cursor);
    sessionStorage.setItem("lastCursor", lastOrder.cursor);

    console.log(orders);

    // create a delivery date field
    for (let i = 0; i < orders.edges.length; i++) {
      let tags = orders.edges[i].node.tags;
      for (let j = 0; j < tags.length; j++) {
        if (
          tags[j].includes("Mon ") ||
          tags[j].includes("Tue ") ||
          tags[j].includes("Wed ") ||
          tags[j].includes("Thu ") ||
          tags[j].includes("Fri ") ||
          tags[j].includes("Sat ") ||
          tags[j].includes("Sun ")
        ) {
          orders.edges[i].node.deliveryDate = new Date(tags[j]);
          break;
        }
      }
    }

    // create the table
    createTable(orders.edges);

    // creat the next and previous buttons
    createPaginationButtons(orders);

    // select submit button and enable it
    const submitBtn = document.querySelector("#delivery_date_btn");
    submitBtn.disabled = false;
  }

  // clean the cursors from the session storage
  clearSessionStorage();

  console.log("hello worlds");

  // build the date picker first
  createDatePicker();
})();
