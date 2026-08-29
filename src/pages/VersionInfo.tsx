import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Copy, Check, ChevronDown } from "lucide-react";
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
  const [showTechnical, setShowTechnical] = useState(false);
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
            // No /* @vite-ignore */ here — it used to be, and that was the bug:
            // it told Vite to leave the specifier untouched, so the bundle
            // shipped a literal import("@capacitor/app"). A WebView can't
            // resolve a bare specifier without an import map, so this threw on
            // every native launch and the catch below silently swallowed it —
            // which is why the native version/build rows never rendered on
            // device. Plain dynamic import, matching useAndroidBackButton.ts
            // and useCapacitorAuthDeepLink.ts, lets Vite resolve and bundle it.
            const { App } = await import("@capacitor/app");
            const info = await App.getInfo();
            setNativeAppVersion(info.version ?? null);
            setNativeBuild(info.build ?? null);
            setBundleId(info.id ?? null);
            setNativeAppName(info.name ?? null);
          } catch (err) {
            // Genuinely expected on web (no native bridge). Log rather than
            // swallow silently so a real native failure is visible next time.
            console.warn("[VersionInfo] native app info unavailable:", err);
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

  // What a normal user or a support conversation actually needs: which app,
  // which version, on what. Everything else is diagnostic detail and lives
  // behind the disclosure below — it used to all be on screen at once, which
  // read as a debug dump rather than an About page.
  const primaryRows: InfoRow[] = [
    { label: "App", value: nativeAppName ?? __APP_NAME__ },
    {
      label: "Version",
      value: nativeAppVersion ?? __APP_VERSION__,
      mono: true,
    },
    { label: "Platform", value: platform },
  ];

  const technicalRows: InfoRow[] = [
    // On native the primary "Version" row shows the store version, so the web
    // bundle version is still worth surfacing here — the two move independently
    // (an OTA web update ships without a new native build).
    ...(nativeAppVersion
      ? [{ label: "Web Bundle Version", value: __APP_VERSION__, mono: true }]
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
    { label: "User Agent", value: navigator.userAgent, mono: true },
  ];

  // Copy always includes the technical rows even when collapsed — the whole
  // point of the button is handing a support conversation everything at once.
  const handleCopy = async () => {
    const text = [...primaryRows, ...technicalRows]
      .map((r) => `${r.label}: ${r.value}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: "Copied", description: "Build info copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const renderRow = (r: InfoRow) => (
    <div
      key={r.label}
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-border/50 pb-2 last:border-0"
    >
      <span className="text-sm text-muted-foreground">{r.label}</span>
      <span className={`text-sm break-all ${r.mono ? "font-mono" : ""}`}>
        {r.value}
      </span>
    </div>
  );

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
            <CardTitle>About</CardTitle>
            <CardDescription>
              Confirm you're running the latest version.
            </CardDescription>
            <p className="mt-2 text-xs text-muted-foreground/70">
              © 2026 Consilair OÜ. All rights reserved. This application is the property of Consilair OÜ.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {primaryRows.map(renderRow)}

            <Collapsible open={showTechnical} onOpenChange={setShowTechnical}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between px-0 text-muted-foreground hover:text-foreground"
                >
                  Technical details
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${showTechnical ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">
                {technicalRows.map(renderRow)}
              </CollapsibleContent>
            </Collapsible>

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
