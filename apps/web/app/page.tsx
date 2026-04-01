"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, MessageSquare } from "lucide-react";

import { useAuth } from "./components/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { StabilityGauge } from "@/components/dashboard/stability-gauge";
import { PriorityCard } from "@/components/dashboard/priority-card";
import { InsightCard } from "@/components/dashboard/insight-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Priority = {
  title: string;
  category: string;
  effort: number;
  time_estimate_min: number;
};

type TodayData = {
  stability_score: number;
  risk_flags: string[];
  priorities: Priority[];
  insight?: string;
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!user) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    setFetchLoading(true);
    setFetchError(false);

    fetch(`${apiUrl}/api/today`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((json) => {
        if (json.ok && json.data) {
          setTodayData(json.data);
        } else {
          setTodayData(null);
        }
      })
      .catch(() => {
        setFetchError(true);
        setTodayData(null);
      })
      .finally(() => setFetchLoading(false));
  }, [user]);

  const greeting = getGreeting();
  const displayName = user?.email?.split("@")[0] ?? "there";

  return (
    <AppShell>
      <motion.div
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Greeting */}
        <motion.div variants={itemVariants}>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}, {displayName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </motion.div>

        {/* Loading state */}
        {(authLoading || fetchLoading) && (
          <motion.div variants={itemVariants}>
            <div className="flex gap-4">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-24 flex-1 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* No data / no check-in today */}
        {!authLoading && !fetchLoading && !todayData && !fetchError && (
          <motion.div variants={itemVariants}>
            <Card className="border-dashed border-border bg-card/50">
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    No check-in yet today
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Start your daily check-in to generate a stability score and
                    prioritized plan.
                  </p>
                </div>
                <Button asChild>
                  <Link href="/checkin">Start today&apos;s check-in</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Fetch error */}
        {!authLoading && fetchError && (
          <motion.div variants={itemVariants}>
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="flex items-center gap-3 p-4">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <p className="text-sm text-muted-foreground">
                  Could not load today&apos;s data. The API may be unavailable.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Dashboard with data */}
        {todayData && (
          <>
            {/* Stability gauge + risk flags */}
            <motion.div
              variants={itemVariants}
              className="flex flex-col items-center gap-6 sm:flex-row sm:items-start"
            >
              <StabilityGauge score={todayData.stability_score} />

              {todayData.risk_flags && todayData.risk_flags.length > 0 && (
                <div className="flex-1 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Risk flags
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {todayData.risk_flags.map((flag) => (
                      <Badge
                        key={flag}
                        variant="outline"
                        className="border-warning/40 bg-warning/10 text-warning"
                      >
                        {flag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>

            {/* Top 3 priorities */}
            {todayData.priorities && todayData.priorities.length > 0 && (
              <motion.div variants={itemVariants} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Top priorities
                </p>
                {todayData.priorities.slice(0, 3).map((p, i) => (
                  <PriorityCard key={p.title} priority={p} rank={i + 1} />
                ))}
              </motion.div>
            )}

            {/* Insight */}
            {todayData.insight && (
              <motion.div variants={itemVariants}>
                <InsightCard text={todayData.insight} />
              </motion.div>
            )}

            {/* Quick actions */}
            <motion.div variants={itemVariants} className="flex gap-3">
              <Button variant="outline" asChild>
                <Link href="/today">View full plan</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/checkin">Update check-in</Link>
              </Button>
            </motion.div>
          </>
        )}

        {/* Unauthenticated fallback */}
        {!authLoading && !user && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                <h2 className="text-lg font-semibold text-foreground">
                  Welcome to AI Life Ops
                </h2>
                <p className="text-sm text-muted-foreground">
                  Operator-grade decision orchestration for your daily life.
                </p>
                <div className="flex gap-3">
                  <Button asChild>
                    <Link href="/login">Sign in</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/register">Register</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </AppShell>
  );
}
