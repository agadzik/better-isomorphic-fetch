import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return new Response("VERCEL_TOKEN environment variable is not set", {
      status: 500,
    });
  }

  const redirectTo = request.nextUrl.searchParams.get("from") || "/";
  const response = NextResponse.redirect(new URL(redirectTo, request.url));

  response.cookies.set("authorization", token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  return response;
}
