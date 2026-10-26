import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"Float — A clearer view of what’s ahead",description:"Your cash flow, looking forward. A calm financial workspace for independent businesses.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
