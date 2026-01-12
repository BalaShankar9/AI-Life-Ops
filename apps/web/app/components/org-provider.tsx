"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type OrgSummary = {
  id: string;
  name: string;
  org_type: "personal" | "team";
  my_role: "owner" | "admin" | "member" | "coach" | "viewer";
  member_count: number;
  created_at: string;
};

type OrgContextType = {
  orgs: OrgSummary[];
  activeOrgId: string | null;
  setActiveOrgId: (orgId: string) => void;
  loading: boolean;
};

const OrgContext = createContext<OrgContextType | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrgs() {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/orgs`, {
          credentials: "include"
        });

        if (response.ok) {
          const data = await response.json();
          if (data.ok && data.data.orgs) {
            setOrgs(data.data.orgs);
            
            // Set active org from localStorage or default to first
            const stored = localStorage.getItem("activeOrgId");
            const validOrgId = data.data.orgs.find((o: OrgSummary) => o.id === stored)
              ? stored
              : data.data.orgs[0]?.id;
            
            setActiveOrgIdState(validOrgId || null);
          }
        }
      } catch (error) {
        console.error("Failed to fetch orgs:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchOrgs();
  }, []);

  const setActiveOrgId = (orgId: string) => {
    setActiveOrgIdState(orgId);
    localStorage.setItem("activeOrgId", orgId);
  };

  return (
    <OrgContext.Provider value={{ orgs, activeOrgId, setActiveOrgId, loading }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error("useOrg must be used within OrgProvider");
  }
  return context;
}

export function getActiveOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("activeOrgId");
}
