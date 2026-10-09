export type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: { shortText?: string; types?: string[] }[];
  location?: { latitude: number; longitude: number };
  businessStatus?: string;
  websiteUri?: string;
  internationalPhoneNumber?: string;
  googleMapsUri?: string;
  attributions?: { provider?: string; providerUri?: string }[];
};

export type GoogleSearchResult = {
  places: GooglePlace[];
  nextPageToken: string | null;
  estimatedCostUsd: number;
  notice: string;
};
