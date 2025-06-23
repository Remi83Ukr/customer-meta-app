import { json } from "@remix-run/node";
import type { LoaderFunction } from "@remix-run/node";

export const loader: LoaderFunction = async ({ request }) => {
  console.log("✅ /ping was called:", request.url);
  return json({ message: "pong" });
};
