/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as data from "../data.js";
import type * as dev from "../dev.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as lib_authPolicy from "../lib/authPolicy.js";
import type * as lib_authorization from "../lib/authorization.js";
import type * as lib_practiceAccess from "../lib/practiceAccess.js";
import type * as lib_practiceModel from "../lib/practiceModel.js";
import type * as lib_practicePlan from "../lib/practicePlan.js";
import type * as lib_progress from "../lib/progress.js";
import type * as lib_progressModel from "../lib/progressModel.js";
import type * as lib_rewards from "../lib/rewards.js";
import type * as lib_vocabulary from "../lib/vocabulary.js";
import type * as lists from "../lists.js";
import type * as pilot from "../pilot.js";
import type * as practice from "../practice.js";
import type * as progress from "../progress.js";
import type * as rewards from "../rewards.js";
import type * as users from "../users.js";
import type * as words from "../words.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  data: typeof data;
  dev: typeof dev;
  health: typeof health;
  http: typeof http;
  imports: typeof imports;
  "lib/authPolicy": typeof lib_authPolicy;
  "lib/authorization": typeof lib_authorization;
  "lib/practiceAccess": typeof lib_practiceAccess;
  "lib/practiceModel": typeof lib_practiceModel;
  "lib/practicePlan": typeof lib_practicePlan;
  "lib/progress": typeof lib_progress;
  "lib/progressModel": typeof lib_progressModel;
  "lib/rewards": typeof lib_rewards;
  "lib/vocabulary": typeof lib_vocabulary;
  lists: typeof lists;
  pilot: typeof pilot;
  practice: typeof practice;
  progress: typeof progress;
  rewards: typeof rewards;
  users: typeof users;
  words: typeof words;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
