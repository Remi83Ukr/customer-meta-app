import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

function verifyHmac(params: URLSearchParams, secret: string) {
  const hmac = params.get("hmac");
  if (!hmac) return false;

  const sortedParams = Array.from(params.entries())
    .filter(([key]) => key !== "hmac")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const generatedHmac = crypto
    .createHmac("sha256", secret)
    .update(sortedParams)
    .digest("hex");

  return generatedHmac === hmac;
}

export const loader: LoaderFunction = async ({ request }) => {
  console.log(request);
  const url = new URL(request.url);
  const params = url.searchParams;

  const SHOPIFY_SECRET = process.env.SHOPIFY_API_SECRET!;
  const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN!;
  const SHOP = process.env.SHOP!;

  if (!verifyHmac(params, SHOPIFY_SECRET)) {
    return json({ error: "Invalid HMAC" }, { status: 403 });
  }

  const customerId = params.get("customer_id");
  const value = params.get("value");

  if (!customerId || !value) {
    return json({ error: "Missing parameters" }, { status: 400 });
  }

  const customerGID = 'gid://shopify/Customer/${customerId}';

  const query = `
    mutation customerUpdate($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer {
          id
          metafields(first: 5) {
            edges {
              node {
                namespace
                key
                value
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      id: customerGID,
      metafields: [
        {
          namespace: "custom",
          key: "kvk",
          type: "single_line_text_field",
          value: value,
        },
      ],
    },
  };

  try {
    const response = await axios.post(
      `https://${SHOP}.myshopify.com/admin/api/2023-10/graphql.json`,
    { query, variables },
    {
      headers: {
        "X-Shopify-Access-Token": ADMIN_TOKEN,
          "Content-Type": "application/json",
      },
    }
  );

    const result = response.data;

    if (result.errors || result.data.customerUpdate.userErrors.length > 0) {
      return json({ error: "GraphQL error", details: result }, { status: 500 });
    }

    return json({ success: true, response: result.data.customerUpdate });
  } catch (error: any) {
    console.error(error.response?.data || error.message);
    return json({ error: "Internal error" }, { status: 500 });
  }
};
