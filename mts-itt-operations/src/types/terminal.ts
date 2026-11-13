export const TERMINAL_CODES = ["CWIT", "SAGT", "CICT", "JCT", "ECT"] as const;
export type TerminalCode = (typeof TERMINAL_CODES)[number];

export type ContainerSize = "20FT" | "40FT";
export const CONTAINER_SIZES: ContainerSize[] = ["20FT", "40FT"];

export interface Terminal {
  code: TerminalCode;
  name: string;
  role: "Source" | "Destination" | "Source & Destination";
  status: "Active" | "Conditional" | "Inactive";
  note: string;
}

export interface RouteRecord {
  id: string;
  code: string;
  source: TerminalCode;
  destination: TerminalCode;
  description: string;
  status: "Active" | "Conditional" | "Inactive";
}

export interface ContainerType {
  size: ContainerSize;
  label: string;
  teu: number;
  /** Maximum containers of this size on one trailer / physical journey. */
  maxPerJourney: number;
  status: "Active" | "Inactive";
}
