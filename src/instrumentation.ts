import type { Instrumentation } from "next";

// Deliberately ignore error, request and context: all can contain user input,
// credentials, profile IDs or URLs. No external telemetry provider is installed.
export const onRequestError: Instrumentation.onRequestError = () => {
  console.error(JSON.stringify({ event: "server_request_failed", service: "glosaventyret" }));
};
