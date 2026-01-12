"use client";

import { useOrg } from "./org-provider";

export function OrgSwitcher() {
  const { orgs, activeOrgId, setActiveOrgId, loading } = useOrg();

  if (loading) {
    return (
      <div className="text-sm text-gray-500">
        Loading...
      </div>
    );
  }

  if (orgs.length === 0) {
    return null;
  }

  // If only one org (Personal), don't show switcher
  if (orgs.length === 1) {
    return (
      <div className="text-sm text-gray-600">
        {orgs[0].name}
      </div>
    );
  }

  return (
    <select
      value={activeOrgId || ""}
      onChange={(e) => {
        setActiveOrgId(e.target.value);
        window.location.reload(); // Reload to fetch data for new org
      }}
      className="text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {orgs.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name} {org.org_type === "personal" ? "(Personal)" : `(${org.my_role})`}
        </option>
      ))}
    </select>
  );
}
