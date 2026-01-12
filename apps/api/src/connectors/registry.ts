import type { ConnectorProvider } from "@prisma/client";

import { googleCalendarConnector } from "./providers/google_calendar";
import type { ConnectorAdapter } from "./types";

const registry: Record<ConnectorProvider, ConnectorAdapter> = {
  google_calendar: googleCalendarConnector
};

export const CONNECTOR_PROVIDERS = Object.keys(
  registry
) as ConnectorProvider[];

export function getConnectorAdapter(provider: ConnectorProvider): ConnectorAdapter {
  return registry[provider];
}

export function isConnectorProvider(value: string): value is ConnectorProvider {
  return Object.prototype.hasOwnProperty.call(registry, value);
}
