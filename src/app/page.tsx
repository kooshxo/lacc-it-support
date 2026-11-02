import { redirect } from "next/navigation";
export default function Home() { redirect(process.env.DATA_BACKEND === "sql" ? "/requests/new" : "/it"); }
