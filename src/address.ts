import dotenv from "dotenv";
dotenv.config();
import { deriveNomicAddress } from ".";

console.log(deriveNomicAddress(process.env.RECEIVER || ""));
