// middleware.js
import { NextResponse } from "next/server";

export function middleware(request) {
  const url = request.nextUrl.clone();

  // Redirect HTTP to HTTPS
  if (process.env.NODE_ENV === "production" && request.headers.get("x-forwarded-proto") !== "https") {
    url.protocol = "https:";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}