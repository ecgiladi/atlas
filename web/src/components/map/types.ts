export interface CountryDatum {
  iso3: string;
  name_he: string;
  visa_status: string | null;
  visa_note: string | null;
  cost_vs_israel: number | null;
  flight_from_tlv_minutes: number | null;
}
