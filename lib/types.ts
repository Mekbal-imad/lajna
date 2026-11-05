export type RoleRef = { code: string; name_ar: string };
export type CommitteeRef = { id: string; name_ar: string };

export type UserRow = {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  user_roles: { roles: RoleRef | null }[];
  committee_members: { member_role: "head" | "member"; committees: CommitteeRef | null }[];
};
