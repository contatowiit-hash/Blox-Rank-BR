import type { z } from "zod";
import type {
  apiErrorEnvelopeSchema,
  apiIssueSchema,
  backendRegistrationSchema,
  bracketMatchSchema,
  bracketPlayerSchema,
  healthSchema,
  paginationSchema,
  publicBracketSchema,
  publicParticipantSchema,
  publicSocialConfigSchema,
  registrationInputSchema,
  registrationReceiptSchema,
  tournamentSchema,
} from "./schemas";

export type RegistrationInput = z.infer<typeof registrationInputSchema>;
export type BackendRegistration = z.infer<typeof backendRegistrationSchema>;
export type RegistrationReceipt = z.infer<typeof registrationReceiptSchema>;
export type Tournament = z.infer<typeof tournamentSchema>;
export type BracketPlayer = z.infer<typeof bracketPlayerSchema>;
export type BracketMatch = z.infer<typeof bracketMatchSchema>;
export type PublicBracket = z.infer<typeof publicBracketSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type PublicParticipant = z.infer<typeof publicParticipantSchema>;
export type Health = z.infer<typeof healthSchema>;
export type PublicSocialConfig = z.infer<typeof publicSocialConfigSchema>;
export type ApiIssue = z.infer<typeof apiIssueSchema>;
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;

export type ApiFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
