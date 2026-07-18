import React, { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import CommoditySidebar from "@/components/CommoditySidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, GraduationCap, Clock, Search, Filter, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useCommodityCounts } from "@/hooks/useCommodityCounts";

interface TutorialCategory {
  id: string;
  name: string;
  description: string;
  sort_order: number;
}

interface Tutorial {
  id: string;
  category_id: string;
  title: string;
  description: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  estimated_time_minutes: number;
  sort_order: number;
  content?: string;
}

interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  category: string;
  examples: string;
}

const LearningHub = () => {
  const [activeGroup, setActiveGroup] = useState("energy");
  const [categories, setCategories] = useState<TutorialCategory[]>([]);
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [glossaryTerms, setGlossaryTerms] = useState<GlossaryTerm[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const commodityCounts = useCommodityCounts();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [categoriesResponse, tutorialsResponse, glossaryResponse] = await Promise.all([
        supabase.from('tutorial_categories').select('*').order('sort_order'),
        supabase.from('tutorials').select('*').order('sort_order'),
        supabase.from('glossary_terms').select('*').order('term')
      ]);

      if (categoriesResponse.error) throw categoriesResponse.error;
      if (tutorialsResponse.error) throw tutorialsResponse.error;
      if (glossaryResponse.error) throw glossaryResponse.error;

      setCategories(categoriesResponse.data || []);
      setTutorials((tutorialsResponse.data || []) as Tutorial[]);
      setGlossaryTerms(glossaryResponse.data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load learning content",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case 'beginner':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'advanced':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredTutorials = tutorials.filter(tutorial => {
    const matchesSearch = tutorial.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tutorial.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || tutorial.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredGlossaryTerms = glossaryTerms.filter(term =>
    term.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
    term.definition.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStartLearning = async (tutorial: Tutorial) => {
    if (!tutorial.content) {
      // Fetch full tutorial content if not already loaded
      try {
        const { data, error } = await supabase
          .from('tutorials')
          .select('content')
          .eq('id', tutorial.id)
          .single();
        
        if (error) throw error;
        
        tutorial.content = data.content;
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load tutorial content",
          variant: "destructive",
        });
        return;
      }
    }
    
    setSelectedTutorial(tutorial);
    setDialogOpen(true);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <CommoditySidebar 
          activeGroup={activeGroup}
          onGroupSelect={(group) => navigate(`/?group=${group}`)}
          commodityCounts={commodityCounts}
        />
        <SidebarInset className="flex-1">
          <header className="flex h-16 shrink-0 items-center border-b px-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mr-2">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
            <Separator orientation="vertical" className="mr-2 h-4" />
            <SidebarTrigger className="p-2 min-h-[48px] min-w-[48px]" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">Learning Hub</h1>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  Commodity Markets Education
                </h2>
                <p className="text-muted-foreground">
                  Understand commodity markets with our comprehensive learning resources
                </p>
              </div>

              <Tabs defaultValue="tutorials" className="space-y-6">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="tutorials" className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Tutorials
                  </TabsTrigger>
                  <TabsTrigger value="glossary" className="flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Glossary
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="tutorials" className="space-y-6">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <Input
                        placeholder="Search tutorials..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="px-3 py-2 border border-border rounded-md bg-background"
                    >
                      <option value="all">All Categories</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : filteredTutorials.length === 0 ? (
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center py-12">
                        <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No tutorials found</h3>
                        <p className="text-muted-foreground text-center">
                          Try adjusting your search terms or category filter
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {filteredTutorials.map((tutorial) => (
                        <Card key={tutorial.id} className="hover:shadow-md transition-shadow cursor-pointer">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between mb-2">
                              <Badge 
                                variant="outline" 
                                className={getDifficultyColor(tutorial.difficulty_level)}
                              >
                                {tutorial.difficulty_level}
                              </Badge>
                              {tutorial.estimated_time_minutes && (
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  <span>{tutorial.estimated_time_minutes}m</span>
                                </div>
                              )}
                            </div>
                            <CardTitle className="text-lg">
                              {tutorial.title}
                            </CardTitle>
                            <CardDescription>
                              {tutorial.description}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <Button 
                              variant="outline" 
                              className="w-full"
                              onClick={() => handleStartLearning(tutorial)}
                            >
                              Start Learning
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="glossary" className="space-y-6">
                  <div className="flex-1">
                    <Input
                      placeholder="Search glossary terms..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : filteredGlossaryTerms.length === 0 ? (
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center py-12">
                        <Search className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No terms found</h3>
                        <p className="text-muted-foreground text-center">
                          Try adjusting your search terms
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4">
                      {filteredGlossaryTerms.map((term) => (
                        <Card key={term.id}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-lg text-primary">
                                {term.term}
                              </CardTitle>
                              {term.category && (
                                <Badge variant="secondary">
                                  {term.category}
                                </Badge>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <p className="text-foreground mb-3 leading-relaxed">
                              {term.definition}
                            </p>
                            {term.examples && (
                              <div className="bg-muted p-3 rounded-lg">
                                <p className="text-sm text-muted-foreground font-medium mb-1">
                                  Examples:
                                </p>
                                <p className="text-sm">
                                  {term.examples}
                                </p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </SidebarInset>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                {selectedTutorial?.title}
              </DialogTitle>
              <DialogDescription>
                {selectedTutorial?.description}
              </DialogDescription>
            </DialogHeader>
            
            {selectedTutorial && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <Badge 
                    variant="outline" 
                    className={getDifficultyColor(selectedTutorial.difficulty_level)}
                  >
                    {selectedTutorial.difficulty_level}
                  </Badge>
                  {selectedTutorial.estimated_time_minutes && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{selectedTutorial.estimated_time_minutes} minutes</span>
                    </div>
                  )}
                </div>
                
                <Separator />
                
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-foreground leading-relaxed">
                    {selectedTutorial.content}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </SidebarProvider>
  );
};

export default LearningHub;