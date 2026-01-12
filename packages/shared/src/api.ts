import { z } from "zod";

import { EngineOutputSchema, FlagsSchema } from "./engine";
import { OnboardingStatusSchema, ProfileSchema } from "./profile";
import {
  ActionFeedbackInputSchema,
  ActionFeedbackSchema,
  FocusPreferenceSchema,
  PersonalizationProfileInputSchema,
  PersonalizationProfileSchema,
  RecalibrationProposalSchema,
  WeightsSchema
} from "./personalization";
import {
  MembershipRoleSchema,
  OrgMemberSchema,
  OrgSummarySchema
} from "./org";
import {
  ConsentScopeSchema,
  RedactedHistoryItemSchema,
  RedactedTodaySchema,
  RedactedWeeklyReportSchema,
  SharingConsentSchema,
  SharedOwnerSchema
} from "./sharing";
import {
  ComparisonResultSchema,
  ScenarioPackInputSchema,
  ScenarioPackListItemSchema,
  ScenarioPackSchema,
  ScenarioSchema,
  SimulationResultSchema
} from "./scenario";
import { WeeklyReviewSchema } from "./weekly";

export const ApiErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        message: z.string(),
        request_id: z.string().optional()
      })
      .strict()
  })
  .strict();

export const ApiSuccessSchema = z
  .object({
    ok: z.literal(true),
    data: z.record(z.unknown())
  })
  .strict();

export const ApiResponseSchema = ApiSuccessSchema.or(ApiErrorSchema);

export type ApiErrorResponse = z.infer<typeof ApiErrorSchema>;
export type ApiSuccessResponse = z.infer<typeof ApiSuccessSchema>;
export type ApiResponse = z.infer<typeof ApiResponseSchema>;

export const SnapshotSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    checkinId: z.string(),
    createdAt: z.string(),
    output: EngineOutputSchema,
    lifeStabilityScore: z.number().int().min(0).max(100),
    flags: FlagsSchema
  })
  .strict();

export const CheckinResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        snapshot: SnapshotSchema
      })
      .strict()
  })
  .strict();

export const TodayResponseSchema = CheckinResponseSchema;

export const HistoryItemSchema = z
  .object({
    date: z.string(),
    life_stability_score: z.number().int().min(0).max(100),
    flags: FlagsSchema
  })
  .strict();

export const HistoryResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        items: z.array(HistoryItemSchema)
      })
      .strict()
  })
  .strict();

export const WeeklyReportSchema = z
  .object({
    id: z.string(),
    week_start: z.string(),
    week_end: z.string(),
    created_at: z.string(),
    content: WeeklyReviewSchema
  })
  .strict();

export const WeeklyReportListItemSchema = z
  .object({
    id: z.string(),
    week_start: z.string(),
    week_end: z.string(),
    created_at: z.string()
  })
  .strict();

export const WeeklyReportResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        report: WeeklyReportSchema.nullable()
      })
      .strict()
  })
  .strict();

export const WeeklyReportListResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        items: z.array(WeeklyReportListItemSchema)
      })
      .strict()
  })
  .strict();

export const AuditEventSchema = z
  .object({
    event_type: z.string().min(1),
    created_at: z.string(),
    metadata_summary: z.string()
  })
  .strict();

export const AuditResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        events: z.array(AuditEventSchema)
      })
      .strict()
  })
  .strict();

export const ConnectorProviderSchema = z.enum(["google_calendar"]);

export const ConnectorStatusSchema = z.enum([
  "disconnected",
  "connected",
  "error"
]);

export const ConnectorSummarySchema = z
  .object({
    provider: ConnectorProviderSchema,
    status: ConnectorStatusSchema,
    last_synced_at: z.string().nullable(),
    last_error: z.string().nullable()
  })
  .strict();

export const ConnectorsResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        connectors: z.array(ConnectorSummarySchema)
      })
      .strict()
  })
  .strict();

export const ConnectorSyncResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        job_id: z.string()
      })
      .strict()
  })
  .strict();

export const ConnectorAuthUrlResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        url: z.string()
      })
      .strict()
  })
  .strict();

export const ConnectorDisconnectResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        connector: ConnectorSummarySchema
      })
      .strict()
  })
  .strict();

export const ProfileResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        profile: ProfileSchema.nullable()
      })
      .strict()
  })
  .strict();

export const OnboardingStatusResponseSchema = z
  .object({
    ok: z.literal(true),
    data: OnboardingStatusSchema
  })
  .strict();

export const ScenarioPackListResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        packs: z.array(ScenarioPackListItemSchema)
      })
      .strict()
  })
  .strict();

export const ScenarioPackResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        pack: ScenarioPackSchema
      })
      .strict()
  })
  .strict();

export const ScenarioPackRequestSchema = ScenarioPackInputSchema;

export const SimulateRequestSchema = z
  .object({
    scenario: ScenarioSchema,
    baseline_date: z.string().optional()
  })
  .strict();

export const SimulateResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        result: SimulationResultSchema
      })
      .strict()
  })
  .strict();

export const CompareRequestSchema = z
  .object({
    scenarios: z.array(ScenarioSchema).min(1).max(6),
    baseline_date: z.string().optional(),
    pack_id: z.string().optional()
  })
  .strict();

export const CompareResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        comparison: ComparisonResultSchema,
        simulations: z.array(SimulationResultSchema)
      })
      .strict()
  })
  .strict();

export const PersonalizationResponseSchema = z
  .object({
    weights: WeightsSchema,
    riskAversion: z.number().min(0).max(1),
    focusPreference: FocusPreferenceSchema,
    isDefault: z.boolean()
  })
  .strict();

export const PersonalizationRequestSchema = PersonalizationProfileInputSchema;

export const ActionFeedbackRequestSchema = ActionFeedbackInputSchema;

export const ActionFeedbackListResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        feedback: z.array(ActionFeedbackSchema)
      })
      .strict()
  })
  .strict();

export const RecalibrationRequestSchema = z
  .object({
    apply: z.boolean().optional()
  })
  .strict();

export const RecalibrationResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        proposal: RecalibrationProposalSchema,
        applied: z.boolean()
      })
      .strict()
  })
  .strict();

export type Snapshot = z.infer<typeof SnapshotSchema>;
export type CheckinResponse = z.infer<typeof CheckinResponseSchema>;
export type TodayResponse = z.infer<typeof TodayResponseSchema>;
export type HistoryItem = z.infer<typeof HistoryItemSchema>;
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;
export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;
export type WeeklyReportListItem = z.infer<typeof WeeklyReportListItemSchema>;
export type WeeklyReportResponse = z.infer<typeof WeeklyReportResponseSchema>;
export type WeeklyReportListResponse = z.infer<
  typeof WeeklyReportListResponseSchema
>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AuditResponse = z.infer<typeof AuditResponseSchema>;
export type ConnectorProvider = z.infer<typeof ConnectorProviderSchema>;
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;
export type ConnectorSummary = z.infer<typeof ConnectorSummarySchema>;
export type ConnectorsResponse = z.infer<typeof ConnectorsResponseSchema>;
export type ConnectorSyncResponse = z.infer<typeof ConnectorSyncResponseSchema>;
export type ConnectorAuthUrlResponse = z.infer<
  typeof ConnectorAuthUrlResponseSchema
>;
export type ConnectorDisconnectResponse = z.infer<
  typeof ConnectorDisconnectResponseSchema
>;
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
export type OnboardingStatusResponse = z.infer<
  typeof OnboardingStatusResponseSchema
>;
export type ScenarioPackListResponse = z.infer<
  typeof ScenarioPackListResponseSchema
>;
export type ScenarioPackResponse = z.infer<typeof ScenarioPackResponseSchema>;
export type ScenarioPackRequest = z.infer<typeof ScenarioPackRequestSchema>;
export type SimulateRequest = z.infer<typeof SimulateRequestSchema>;
export type SimulateResponse = z.infer<typeof SimulateResponseSchema>;
export type CompareRequest = z.infer<typeof CompareRequestSchema>;
export type CompareResponse = z.infer<typeof CompareResponseSchema>;
export type PersonalizationResponse = z.infer<
  typeof PersonalizationResponseSchema
>;
export type PersonalizationRequest = z.infer<
  typeof PersonalizationRequestSchema
>;
export type ActionFeedbackRequest = z.infer<
  typeof ActionFeedbackRequestSchema
>;
export type ActionFeedbackListResponse = z.infer<
  typeof ActionFeedbackListResponseSchema
>;
export type RecalibrationRequest = z.infer<typeof RecalibrationRequestSchema>;
export type RecalibrationResponse = z.infer<
  typeof RecalibrationResponseSchema
>;

// Organization management schemas
export const OrgsListResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    orgs: z.array(OrgSummarySchema)
  }).strict()
}).strict();

export const CreateOrgRequestSchema = z.object({
  name: z.string().min(1).max(100)
}).strict();

export const CreateOrgResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    org: OrgSummarySchema
  }).strict()
}).strict();

export const InviteMemberRequestSchema = z.object({
  email: z.string().email(),
  role: MembershipRoleSchema
}).strict();

export const InviteMemberResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    inviteToken: z.string(),
    expiresAt: z.string()
  }).strict()
}).strict();

export const AcceptInviteRequestSchema = z.object({
  token: z.string()
}).strict();

export const AcceptInviteResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    orgId: z.string(),
    role: MembershipRoleSchema
  }).strict()
}).strict();

export const UpdateMemberRoleRequestSchema = z.object({
  role: MembershipRoleSchema
}).strict();

export const UpdateMemberRoleResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    success: z.boolean()
  }).strict()
}).strict();

export const RevokeMemberResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    success: z.boolean()
  }).strict()
}).strict();

export const OrgMembersListResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    members: z.array(OrgMemberSchema)
  }).strict()
}).strict();

export type OrgsListResponse = z.infer<typeof OrgsListResponseSchema>;
export type CreateOrgRequest = z.infer<typeof CreateOrgRequestSchema>;
export type CreateOrgResponse = z.infer<typeof CreateOrgResponseSchema>;
export type InviteMemberRequest = z.infer<typeof InviteMemberRequestSchema>;
export type InviteMemberResponse = z.infer<typeof InviteMemberResponseSchema>;
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequestSchema>;
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponseSchema>;
export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequestSchema>;
export type UpdateMemberRoleResponse = z.infer<typeof UpdateMemberRoleResponseSchema>;
export type RevokeMemberResponse = z.infer<typeof RevokeMemberResponseSchema>;
export type OrgMembersListResponse = z.infer<typeof OrgMembersListResponseSchema>;

// Consent-based sharing schemas
export const ConsentsListResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    consents: z.array(SharingConsentSchema)
  }).strict()
}).strict();

export const GrantConsentRequestSchema = z.object({
  viewerUserId: z.string(),
  scope: ConsentScopeSchema
}).strict();

export const GrantConsentResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    consent: SharingConsentSchema
  }).strict()
}).strict();

export const RevokeConsentRequestSchema = z.object({
  viewerUserId: z.string(),
  scope: ConsentScopeSchema
}).strict();

export const RevokeConsentResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    success: z.boolean()
  }).strict()
}).strict();

export const SharedOwnersListResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    owners: z.array(SharedOwnerSchema)
  }).strict()
}).strict();

export const SharedWeeklyResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    report: RedactedWeeklyReportSchema
  }).strict()
}).strict();

export const SharedHistoryResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    history: z.array(RedactedHistoryItemSchema)
  }).strict()
}).strict();

export const SharedTodayResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    today: RedactedTodaySchema
  }).strict()
}).strict();

export type ConsentsListResponse = z.infer<typeof ConsentsListResponseSchema>;
export type GrantConsentRequest = z.infer<typeof GrantConsentRequestSchema>;
export type GrantConsentResponse = z.infer<typeof GrantConsentResponseSchema>;
export type RevokeConsentRequest = z.infer<typeof RevokeConsentRequestSchema>;
export type RevokeConsentResponse = z.infer<typeof RevokeConsentResponseSchema>;
export type SharedOwnersListResponse = z.infer<typeof SharedOwnersListResponseSchema>;
export type SharedWeeklyResponse = z.infer<typeof SharedWeeklyResponseSchema>;
export type SharedHistoryResponse = z.infer<typeof SharedHistoryResponseSchema>;
export type SharedTodayResponse = z.infer<typeof SharedTodayResponseSchema>;


