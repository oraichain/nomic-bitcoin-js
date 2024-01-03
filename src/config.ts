import dotenv from "dotenv";
dotenv.config();

export const userConfig = {
  WALLET_PREFIX: process.env.WALLET_PREFIX || "oraibtc",
};

export const networkConfig = {
  RELAYERS: [process.env.RELAYER || "https://oraibtc.relayer.orai.io:443"],
  IBC_CHANNEL: process.env.IBC_CHANNEL || "channel-1",
  NETWORK: process.env.NETWORK || "testnet",
};
