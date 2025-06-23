import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

function verifySignature(params: URLSearchParams, secret: string) {
  const signature = params.get("signature");
  if (!signature) return false;

  // виключаємо signature з параметрів
  const sortedParams = Array.from(params.entries())
    .filter(([key]) => key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("");

  const generatedSignature = crypto
    .createHmac("sha256", secret)
    .update(sortedParams)
    .digest("hex");

  return generatedSignature === signature;
}

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const params = url.searchParams;

  const SHOPIFY_SECRET = process.env.SHOPIFY_API_SECRET!;
  const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN!;
  const SHOP = process.env.SHOP!;

  console.log('hello', process.env.SHOPIFY_ADMIN_API_TOKEN);

  if (!verifySignature(params, SHOPIFY_SECRET)) {
    return json({ error: "Invalid HMAC" }, { status: 403 });
  }

  const customerId = params.get("customer_id");
  const value = params.get("value");

  if (!customerId || !value) {
    return json({ error: "Missing parameters" }, { status: 400 });
  }

  const customerGID = `gid://shopify/Customer/${customerId}`;

  const query = `
    mutation customerUpdate($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer {
          id
          metafields(first: 5) {
            edges {
              node {
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

  console.log(ADMIN_TOKEN)

  try {
    const response = await axios.post(
      `https://${SHOP}.myshopify.com/admin/api/2025-04/graphql.json`,
      { query, variables },
      {
        headers: {
          "X-Shopify-Access-Token": ADMIN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(response)

    const result = response.data;


    if (result.errors || result.data.customerUpdate.userErrors.length > 0) {
      return json({ error: "GraphQL error", details: result }, { status: 500 });
    }

    return json({ success: true, data: result.data.customerUpdate });
  } catch (err: any) {
    console.error(err?.response?.data || err.message);
    return json({ error: "Server error" }, { status: 500 });
  }
};
