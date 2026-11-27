import type { MarketState } from "./market-types.ts";
export type { Lesson } from "./market-types.ts";
export type Device = { id: string; label: string; active: boolean };
type CommonState = {
  revision: number;
  serverNow: string;
  username: string;
  deviceLabel: string;
  activeDeviceLabel: string | null;
  devices: Device[];
};
export type PlayerState = CommonState & {
  mode: "active";
  playerId: string;
  economy: import("./economy-types.ts").EconomyState;
} & MarketState;
export type SignInResult = { token: string; state: PlayerState };
export type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: import("./market-types.ts").FundsDetails;
  };
};
