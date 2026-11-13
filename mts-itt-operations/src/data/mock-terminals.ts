import type { ContainerType, RouteRecord, Terminal } from "@/types/terminal";

export const MOCK_TERMINALS: Terminal[] = [
  { code: "CWIT", name: "Colombo West International Terminal", role: "Source", status: "Active", note: "Initial source terminal. Daily XLSX report." },
  { code: "SAGT", name: "South Asia Gateway Terminals", role: "Source", status: "Active", note: "Initial source terminal. Detailed line items, limited summary." },
  { code: "CICT", name: "Colombo International Container Terminals", role: "Source", status: "Conditional", note: "Being added – subject to receiving and validating a usable sample report format." },
  { code: "JCT", name: "Jaya Container Terminal", role: "Destination", status: "Active", note: "Destination terminal." },
  { code: "ECT", name: "East Container Terminal", role: "Destination", status: "Inactive", note: "Not currently operational for this use case." },
];

export const MOCK_ROUTES: RouteRecord[] = [
  { id: "R-001", code: "CWIT-JCT", source: "CWIT", destination: "JCT", description: "CWIT to Jaya Container Terminal (main transhipment lane)", status: "Active" },
  { id: "R-002", code: "SAGT-JCT", source: "SAGT", destination: "JCT", description: "SAGT to Jaya Container Terminal", status: "Active" },
  { id: "R-003", code: "CWIT-SAGT", source: "CWIT", destination: "SAGT", description: "CWIT to SAGT inter-terminal shuttle", status: "Active" },
  { id: "R-004", code: "CICT-JCT", source: "CICT", destination: "JCT", description: "CICT to Jaya Container Terminal (pilot – pending sample validation)", status: "Conditional" },
  { id: "R-005", code: "CWIT-ECT", source: "CWIT", destination: "ECT", description: "CWIT to East Container Terminal (not operational)", status: "Inactive" },
];

export const MOCK_CONTAINER_TYPES: ContainerType[] = [
  { size: "20FT", label: "20 ft container (TEU 1)", teu: 1, maxPerJourney: 2, status: "Active" },
  { size: "40FT", label: "40 ft container (TEU 2)", teu: 2, maxPerJourney: 1, status: "Active" },
];
