import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import SEOHead from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText } from 'lucide-react';
import attributions from '@/data/ossAttributions.json';

type Entry = { name: string; version?: string; license: string; url: string };
const LIBRARIES = attributions.libraries as Entry[];
const DATA_SOURCES = attributions.dataSources as Entry[];
const GENERATED_AT = attributions.generatedAt as string;

const Licenses: React.FC = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Open Source Licenses - Commodity Hub"
        description="Open source software, library attributions, and data source licenses used by Commodity Hub."
        keywords={['licenses', 'open source', 'attributions', 'oss']}
      />

      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Dashboard
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <FileText className="h-6 w-6" />
                Open Source Licenses & Attributions
              </CardTitle>
              <CardDescription>
                Commodity Hub is built on the shoulders of giants. We gratefully acknowledge the
                open source projects and data providers listed below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 text-sm leading-relaxed">
              <section>
                <h2 className="text-lg font-semibold mb-3">Software libraries</h2>
                <ul className="divide-y divide-border rounded-md border">
                  {LIBRARIES.map((lib) => (
                    <li key={lib.name} className="flex items-center justify-between gap-4 px-4 py-2">
                      <a
                        href={lib.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline"
                      >
                        {lib.name}
                        {lib.version ? (
                          <span className="text-muted-foreground text-xs ml-2">v{lib.version}</span>
                        ) : null}
                      </a>
                      <span className="text-muted-foreground text-xs">{lib.license}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground text-xs mt-2">
                  Auto-generated from package.json on{' '}
                  {new Date(GENERATED_AT).toLocaleDateString()}.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">Data sources</h2>
                <ul className="divide-y divide-border rounded-md border">
                  {DATA_SOURCES.map((src) => (
                    <li key={src.name} className="flex items-center justify-between gap-4 px-4 py-2">
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline"
                      >
                        {src.name}
                      </a>
                      <span className="text-muted-foreground text-xs">{src.license}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <p className="text-muted-foreground">
                  Full license texts are available at each project's homepage. For questions about
                  attributions, contact{' '}
                  <a href="mailto:legal@commodity-hub.app" className="underline">
                    legal@commodity-hub.app
                  </a>
                  .
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default Licenses;