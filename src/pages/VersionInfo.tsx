import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InfoRow {
  label: string;
  value: string;
  mono?: boolean;
}

const VersionInfo: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState<string>("web");
  const [nativeAppVersion, setNativeAppVersion] = useState<string | null>(null);
  const [nativeBuild, setNativeBuild] = useState<string | null>(null);
  const [bundleId, setBundleId] = useState<string | null>(null);
  const [nativeAppName, setNativeAppName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cap = (window as any).Capacitor;
        if (cap?.isNativePlatform?.()) {
          setPlatform(cap.getPlatform?.() ?? "native");
          try {
            const mod = await import(/* @vite-ignore */ "@capacitor/app");
            const info = await mod.App.getInfo();
            setNativeAppVersion(info.version ?? null);
            setNativeBuild(info.build ?? null);
            setBundleId(info.id ?? null);
            setNativeAppName(info.name ?? null);
          } catch {
            // @capacitor/app not available in web build
          }
        } else {
          setPlatform("web");
        }
      } catch {
        setPlatform("web");
      }
    })();
  }, []);

  const buildTime = (() => {
    try {
      return new Date(__BUILD_TIME__).toLocaleString();
    } catch {
      return __BUILD_TIME__;
    }
  })();

  const rows: InfoRow[] = [
    { label: "App Name", value: __APP_NAME__ },
    ...(nativeAppName ? [{ label: "Native App Name", value: nativeAppName }] : []),
    { label: "Web Version", value: __APP_VERSION__ },
    ...(nativeAppVersion
      ? [{ label: "Native Version", value: nativeAppVersion }]
      : []),
    ...(nativeBuild
      ? [{ label: "Native Build Number", value: nativeBuild, mono: true }]
      : []),
    ...(bundleId
      ? [
          {
            label: platform === "ios" ? "Bundle ID" : "Application ID",
            value: bundleId,
            mono: true,
          },
        ]
      : []),
    { label: "Build Mode", value: __BUILD_MODE__ },
    { label: "Build Time", value: buildTime },
    { label: "Commit", value: __BUILD_COMMIT__, mono: true },
    { label: "Platform", value: platform },
    { label: "User Agent", value: navigator.userAgent, mono: true },
  ];

  const handleCopy = async () => {
    const text = rows.map((r) => `${r.label}: ${r.value}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: "Copied", description: "Build info copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <Button
          variant="ghost"
          onClick={() => navigate("/dashboard")}
          className="mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Dashboard
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Version & Build Info</CardTitle>
                <CardDescription>
                  Confirm you're running the latest build.
                </CardDescription>
              </div>
              <Badge variant="secondary">{__BUILD_MODE__}</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground/70">
              © 2026 Consilair OÜ. All rights reserved. This application is the property of Consilair OÜ.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-border/50 pb-2 last:border-0"
              >
                <span className="text-sm text-muted-foreground">{r.label}</span>
                <span
                  className={`text-sm break-all ${r.mono ? "font-mono" : ""}`}
                >
                  {r.value}
                </span>
              </div>
            ))}

            <Button onClick={handleCopy} variant="outline" className="w-full mt-4">
              {copied ? (
                <Check className="h-4 w-4 mr-2" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              Copy build info
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VersionInfo;