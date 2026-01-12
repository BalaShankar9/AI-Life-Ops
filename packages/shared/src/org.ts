import { z } from "zod";

export const OrgTypeSchema = z.enum(["personal", "team"]);
export type OrgType = z.infer<typeof OrgTypeSchema>;

export const MembershipRoleSchema = z.enum(["owner", "admin", "member", "coach", "viewer"]);
export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

export const MembershipStatusSchema = z.enum(["active", "invited", "revoked"]);
export type MembershipStatus = z.infer<typeof MembershipStatusSchema>;

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: OrgTypeSchema,
  createdAt: z.string(),
  updatedAt: z.string()
}).strict();
export type Organization = z.infer<typeof OrganizationSchema>;

export const MembershipSchema = z.object({
  id: z.string(),
  userId: z.string(),
  orgId: z.string(),
  role: MembershipRoleSchema,
  status: MembershipStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string()
}).strict();
export type Membership = z.infer<typeof MembershipSchema>;

export const OrgInviteSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  email: z.string().email(),
  role: MembershipRoleSchema,
  inviteToken: z.string(),
  expiresAt: z.string(),
  createdAt: z.string()
}).strict();
export type OrgInvite = z.infer<typeof OrgInviteSchema>;

// User org summary (for org listing)
export const OrgSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: OrgTypeSchema,
  role: MembershipRoleSchema,
  memberCount: z.number().int().optional()
}).strict();
export type OrgSummary = z.infer<typeof OrgSummarySchema>;

// Org member summary
export const OrgMemberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  role: MembershipRoleSchema,
  status: MembershipStatusSchema,
  joinedAt: z.string()
}).strict();
export type OrgMember = z.infer<typeof OrgMemberSchema>;
