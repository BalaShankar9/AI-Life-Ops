"use client";

import { useState, useEffect } from "react";

type SharedOwner = {
  user_id: string;
  email: string;
};

type RedactedWeekly = {
  week_start: string;
  summary: string;
  score_trend: string;
  top_risks: string[];
  next_week_focus: string[];
};

type RedactedHistoryItem = {
  date: string;
  life_stability_score: number;
  breakdown?: any;
  flags?: any;
};

export default function ViewerPage() {
  const [owners, setOwners] = useState<SharedOwner[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"weekly" | "history" | "today">("weekly");
  const [weekly, setWeekly] = useState<RedactedWeekly | null>(null);
  const [history, setHistory] = useState<RedactedHistoryItem[]>([]);
  const [today, setToday] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOwners() {
      try {
        const response = await fetch("http://localhost:4000/api/shared/users", {
          credentials: "include"
        });
        if (response.ok) {
          const data = await response.json();
          if (data.ok) {
            setOwners(data.data.owners || []);
            if (data.data.owners.length > 0) {
              setSelectedOwner(data.data.owners[0].user_id);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load owners:", error);
      } finally {
        setLoading(false);
      }
    }
    loadOwners();
  }, []);

  useEffect(() => {
    if (!selectedOwner) return;

    async function loadData() {
      try {
        if (activeTab === "weekly") {
          const response = await fetch(`http://localhost:4000/api/shared/${selectedOwner}/weekly/latest`, {
            credentials: "include"
          });
          if (response.ok) {
            const data = await response.json();
            if (data.ok) setWeekly(data.data.weekly_report);
          }
        } else if (activeTab === "history") {
          const response = await fetch(`http://localhost:4000/api/shared/${selectedOwner}/history`, {
            credentials: "include"
          });
          if (response.ok) {
            const data = await response.json();
            if (data.ok) setHistory(data.data.items || []);
          }
        } else if (activeTab === "today") {
          const response = await fetch(`http://localhost:4000/api/shared/${selectedOwner}/today`, {
            credentials: "include"
          });
          if (response.ok) {
            const data = await response.json();
            if (data.ok) setToday(data.data.today);
          }
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      }
    }
    loadData();
  }, [selectedOwner, activeTab]);

  if (loading) {
    return <div className="text-center text-gray-500">Loading...</div>;
  }

  if (owners.length === 0) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Viewer Portal</h1>
        <p className="text-gray-600">No users have granted you access to their data.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Viewer Portal</h1>

      <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6">
        <p className="text-sm text-yellow-900">
          <strong>Redacted Data:</strong> You are viewing aggregated, redacted insights only.
          Personal notes, comments, and detailed assumptions are not included.
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Viewing Data For:</label>
        <select
          value={selectedOwner || ""}
          onChange={(e) => setSelectedOwner(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2"
        >
          {owners.map((o) => (
            <option key={o.user_id} value={o.user_id}>
              {o.email}
            </option>
          ))}
        </select>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          {["weekly", "history", "today"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "weekly" && weekly && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-2">Week of {weekly.week_start}</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-sm text-gray-600">Summary</h3>
              <p className="text-gray-900">{weekly.summary}</p>
            </div>
            <div>
              <h3 className="font-medium text-sm text-gray-600">Score Trend</h3>
              <p className="text-gray-900">{weekly.score_trend}</p>
            </div>
            {weekly.top_risks.length > 0 && (
              <div>
                <h3 className="font-medium text-sm text-gray-600">Top Risks</h3>
                <ul className="list-disc list-inside text-gray-900">
                  {weekly.top_risks.map((risk, i) => (
                    <li key={i}>{risk}</li>
                  ))}
                </ul>
              </div>
            )}
            {weekly.next_week_focus.length > 0 && (
              <div>
                <h3 className="font-medium text-sm text-gray-600">Next Week Focus</h3>
                <ul className="list-disc list-inside text-gray-900">
                  {weekly.next_week_focus.map((focus, i) => (
                    <li key={i}>{focus}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Daily History</h2>
          <div className="space-y-2">
            {history.map((item, i) => (
              <div key={i} className="flex items-center justify-between border-b border-gray-100 pb-2">
                <span className="text-sm text-gray-600">{item.date}</span>
                <span className="font-semibold">Score: {item.life_stability_score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "today" && today && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Today ({today.date})</h2>
          <div className="text-2xl font-bold mb-4">Life Stability Score: {today.life_stability_score}</div>
          {today.breakdown && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>Energy: {today.breakdown.energy}</div>
              <div>Money: {today.breakdown.money}</div>
              <div>Obligations: {today.breakdown.obligations}</div>
              <div>Growth: {today.breakdown.growth}</div>
              <div>Stability: {today.breakdown.stability}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
