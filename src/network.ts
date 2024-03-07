// data from https://github.com/cosmos/chain-registry/tree/master/testnets
import { GasPrice } from "@cosmjs/stargate";

export interface Network {
  chainId: string;
  rpcEndpoint: string;
  prefix: string;
  gasPrice: GasPrice;
  feeToken: string;
  faucetUrl: string;
}

export const OraichainConfig: Network = {
  chainId: "Oraichain",
  rpcEndpoint: "https://rpc.orai.io",
  prefix: "orai",
  gasPrice: GasPrice.fromString("0.002orai"),
  feeToken: "orai",
  faucetUrl: "https://faucet.orai.io/",
};

export const OraiBtcMainnetConfig: Network = {
  chainId: "oraibtc-mainnet-1",
  rpcEndpoint: "https://btc.rpc.orai.io",
  prefix: "oraibtc",
  gasPrice: GasPrice.fromString("0uoraibtc"),
  feeToken: "uoraibtc",
  faucetUrl: "",
}

export const OraiBtcLocalConfig: Network = {
  chainId: "oraibtc-local-1",
  rpcEndpoint: "http://127.0.0.1:26657",
  prefix: "oraibtc",
  gasPrice: GasPrice.fromString("0uoraibtc"),
  feeToken: "uoraibtc",
  faucetUrl: "",
};