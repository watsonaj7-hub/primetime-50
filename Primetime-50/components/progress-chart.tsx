"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const data = [
  { week: "W1", weight: 187, waist: 39.5, strength: 100 },
  { week: "W2", weight: 185.8, waist: 39.2, strength: 103 },
  { week: "W3", weight: 185.1, waist: 38.8, strength: 106 },
  { week: "W4", weight: 184.4, waist: 38.5, strength: 108 },
  { week: "W5", weight: 183.6, waist: 38.1, strength: 111 },
  { week: "W6", weight: 182.9, waist: 37.8, strength: 112 }
];

export function ProgressChart() {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-bold">Progress dashboard</h2>
        <p className="text-base text-muted-foreground">Trends matter more than daily noise</p>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
              <XAxis dataKey="week" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Line type="monotone" dataKey="weight" stroke="#28756a" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="waist" stroke="#356f8f" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="strength" stroke="#b26d32" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
