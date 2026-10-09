import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";

const names = new Intl.DisplayNames(["en"], { type: "region" });
export const countries = getCountries()
  .map((code) => ({
    code,
    name: names.of(code) ?? code,
    callingCode: getCountryCallingCode(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
export const countryInfo = (code: unknown) =>
  countries.find((c) => c.code === String(code).toUpperCase());
export const industryExamples = [
  "Salons & barbers",
  "Dentists & clinics",
  "Plumbers & electricians",
  "Mechanics & repair shops",
  "Guesthouses & accommodation",
  "Gyms & personal trainers",
  "Accountants & consultants",
  "Retailers & online stores",
  "Restaurants & caterers",
  "Tutors & training centres",
];
export type SearchOptions = {
  countryCode?: string;
  areas?: string[];
  businessTypes?: string[];
  exclusions?: string[];
  excludeChains?: boolean;
  websiteFilter?: "missing" | "weak" | "missing_or_weak" | "any";
  includeAutomation?: boolean;
  targetMode?: "candidates" | "qualified";
  scanLimit?: number;
  auditWebsites?: boolean;
  outreachMode?: "drafts" | "email";
  sendLimit?: number;
  planVersion?: number;
};
export function listText(value: unknown, fallback: string, max = 10) {
  const list = Array.isArray(value)
    ? value
    : String(value ?? fallback).split(/[,;\n]/);
  const result = [
    ...new Set(list.map((x) => String(x).trim()).filter(Boolean)),
  ];
  if (
    !result.length ||
    result.length > max ||
    result.some((x) => x.length > 100)
  )
    throw new Error(`Enter 1–${max} short business types or areas.`);
  return result;
}
export function searchOptions(
  input: Record<string, unknown>,
  fallbackCountry = "ZA",
): SearchOptions {
  const country = countryInfo(input.countryCode ?? fallbackCountry);
  if (!country) throw new Error("Select a valid search country.");
  const exclusions =
    input.exclusions === undefined ||
    input.exclusions === "" ||
    (Array.isArray(input.exclusions) && !input.exclusions.length)
      ? []
      : listText(input.exclusions, "", 20);
  const filter = String(input.websiteFilter ?? "missing_or_weak");
  if (!["missing", "weak", "missing_or_weak", "any"].includes(filter))
    throw new Error("Choose a website filter.");
  const scanLimit = Number(
    input.scanLimit ??
      Math.min(500, Math.max(Number(input.count ?? 5) * 5, 25)),
  );
  const sendLimit = Number(input.sendLimit ?? 5);
  if (
    !Number.isInteger(scanLimit) ||
    scanLimit < Number(input.count ?? 1) ||
    scanLimit > 500
  )
    throw new Error(
      "Candidate scan limit must cover your target and be at most 500.",
    );
  if (!Number.isInteger(sendLimit) || sendLimit < 1 || sendLimit > 20)
    throw new Error("Choose an email limit from 1–20.");
  if (input.outreachMode === "email" && input.confirmSending !== true)
    throw new Error("Confirm automatic email sending for this campaign.");
  return {
    countryCode: country.code,
    exclusions,
    excludeChains: input.excludeChains !== false,
    websiteFilter: filter as SearchOptions["websiteFilter"],
    includeAutomation: input.includeAutomation === true,
    targetMode: input.targetMode === "qualified" ? "qualified" : "candidates",
    scanLimit,
    auditWebsites: input.auditWebsites === true,
    outreachMode: input.outreachMode === "email" ? "email" : "drafts",
    sendLimit,
    planVersion: 3,
  };
}
export function countryPhone(raw: string, code: string) {
  const country = countryInfo(code);
  if (!country) return null;
  const cleaned = raw
    .replace(/\(0\)/g, "")
    .replace(/(?:ext\.?|extension|x)\s*\d+$/i, "")
    .trim();
  const number = parsePhoneNumberFromString(
    cleaned.startsWith("00") ? "+" + cleaned.slice(2) : cleaned,
    country.code as CountryCode,
  );
  return number?.isPossible() ? number.number : null;
}
export function canonicalBusinessName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(?:pty|ltd|limited|inc|llc)\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
export function matchesExclusion(
  name: string,
  category: string,
  exclusions: string[],
) {
  const words = `${name} ${category}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  return exclusions.some((x) => {
    const phrase = x
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    return phrase.length > 1 && ` ${words} `.includes(` ${phrase} `);
  });
}
