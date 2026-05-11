import { z } from "zod";

export const AppConfigSchema = z.object({
  jiraBaseUrl: z.string().url().optional(),
  tempoBaseUrl: z.string().url().optional(),
  zeroclawSessionId: z.string().default("clawj-cli"),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export type ResolvedCredentials = {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  tempoBaseUrl: string;
  tempoApiToken: string;
};
