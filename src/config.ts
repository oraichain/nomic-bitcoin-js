import dotenv from "dotenv";
dotenv.config();

export const userConfig = {
  WALLET_PREFIX: process.env.WALLET_PREFIX || "oraibtc",
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
};

export const networkConfig = {
  RELAYERS: [process.env.RELAYER || "https://oraibtc.relayer.orai.io:443"],
  LCD: [process.env.LCD || "https://oraibtc.lcd.orai.io"],
  IBC_CHANNEL: process.env.IBC_CHANNEL || "channel-0",
  NETWORK: process.env.NETWORK || "testnet",
};
