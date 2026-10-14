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
import type * as dev from "../dev.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as lib_authPolicy from "../lib/authPolicy.js";
import type * as lib_authorization from "../lib/authorization.js";
import type * as lib_vocabulary from "../lib/vocabulary.js";
import type * as lists from "../lists.js";
import type * as users from "../users.js";
import type * as words from "../words.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  dev: typeof dev;
  health: typeof health;
  http: typeof http;
  imports: typeof imports;
  "lib/authPolicy": typeof lib_authPolicy;
  "lib/authorization": typeof lib_authorization;
  "lib/vocabulary": typeof lib_vocabulary;
  lists: typeof lists;
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
