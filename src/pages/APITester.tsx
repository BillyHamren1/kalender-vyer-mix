
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; 
import { toast } from "sonner";
import { AlertCircle, ArrowRight, CheckCircle2, Key, Globe, Download, Upload } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';

const APITester = () => {
  const [directResponse, setDirectResponse] = useState<any>(null);
  const [importResponse, setImportResponse] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clientName, setClientName] = useState('');
  const [requestUrl, setRequestUrl] = useState('');
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Immediately try to get the API key on component mount
  React.useEffect(() => {
    getApiKey();
  }, []);
  
  // Helper function to get the API key
  const getApiKey = async () => {
    try {
      const { data: secretData, error: secretError } = await supabase.functions.invoke(
        'get-api-key',
        {
          method: 'POST',
        }
      );
      
      if (secretError) {
        console.error('Error getting API key:', secretError);
        return null;
      }
      
      if (secretData && secretData.apiKey) {
        setApiKey(secretData.apiKey);
        return secretData.apiKey;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting API key:', error);
      return null;
    }
  };
  
  // Build the URL for display
  const buildUrl = () => {
    const apiUrl = new URL("https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings");
    
    if (startDate) apiUrl.searchParams.append('startDate', startDate);
    if (endDate) apiUrl.searchParams.append('endDate', endDate);
    if (clientName) apiUrl.searchParams.append('client', clientName);
    
    setRequestUrl(apiUrl.toString());
    return apiUrl;
  };
  
  const testDirectCall = async () => {
    try {
      setIsLoading(true);
      toast.info('Testing direct API call...', {
        description: 'Connecting to export_bookings endpoint'
      });
      
      // Get the API key if not already available
      const key = apiKey || await getApiKey();
      
      if (!key) {
        throw new Error('Failed to get API key');
      }
      
      // Build and set the URL
      const apiUrl = buildUrl();
      
      // Make the API call with the x-api-key header
      const response = await fetch(apiUrl.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': key,
          'Content-Type': 'application/json',
        },
      });
      
      setStatusCode(response.status);
      
      // Parse the response
      const responseData = await response.json();
      setDirectResponse(responseData);
      
      if (response.ok) {
        const bookingCount = responseData.data?.length || responseData.count || 0;
        toast.success('API call successful!', {
          description: `Received ${bookingCount} bookings`
        });
      } else {
        toast.error('API call failed', {
          description: responseData.error || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error testing API:', error);
      toast.error('API test failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
      setDirectResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
      setStatusCode(500);
    } finally {
      setIsLoading(false);
    }
  };
  
  const testImportFunction = async () => {
    try {
      setIsLoading(true);
      toast.info('Testing import-bookings function...', {
        description: 'Processing bookings from external API'
      });
      
      // Get the API key if not already available
      if (!apiKey) {
        await getApiKey();
      }
      
      // Build and set the URL (for display purposes)
      const apiUrl = buildUrl();
      
      // Build the filter parameters
      const filters = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        clientName: clientName || undefined
      };
      
      // Call the import-bookings function using the Supabase client
      const { data, error } = await supabase.functions.invoke(
        'import-bookings',
        {
          method: 'POST',
          body: { ...filters }
        }
      );
      
      if (error) {
        throw new Error(`Function error: ${error.message}`);
      }
      
      setImportResponse(data);
      setStatusCode(200);
      
      if (data.success) {
        toast.success('Import function successful!', {
          description: `Imported ${data.results?.imported || 0} of ${data.results?.total || 0} bookings`
        });
      } else {
        toast.error('Import function failed', {
          description: data.error || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error testing import function:', error);
      toast.error('Import function test failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
      setImportResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
      setStatusCode(500);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleApiKeyVisibility = () => {
    setShowApiKey(!showApiKey);
  };
  
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">API Tester</h1>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Test Parameters</CardTitle>
            <CardDescription>
              Configure the API request parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date (YYYY-MM-DD)</Label>
              <Input 
                id="startDate" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="e.g. 2025-05-20" 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date (YYYY-MM-DD)</Label>
              <Input 
                id="endDate" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="e.g. 2025-05-30" 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="clientName">Client Name</Label>
              <Input 
                id="clientName" 
                value={clientName} 
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Volvo" 
              />
            </div>
            
            {/* API information boxes - display immediately */}
            <div className="bg-gray-100 p-2 rounded mt-2 break-all">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-4 w-4 text-gray-600" />
                <span className="font-medium">Request URL:</span>
              </div>
              <div className="pl-6 text-sm overflow-auto">
                {requestUrl || buildUrl().toString()}
              </div>
            </div>
            
            <div className="bg-gray-100 p-2 rounded mt-2">
              <div className="flex items-center gap-2 mb-1">
                <Key className="h-4 w-4 text-gray-600" />
                <span className="font-medium">API Key:</span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={toggleApiKeyVisibility}
                  className="ml-auto text-xs py-0 h-6"
                  disabled={!apiKey}
                >
                  {showApiKey ? "Hide" : "Show"}
                </Button>
              </div>
              <div className="pl-6 text-sm">
                {apiKey 
                  ? (showApiKey ? apiKey : "●●●●●●●●●●●●●●●●●●●●●●●●●●●●●") 
                  : "No API key retrieved yet"}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button 
              onClick={testDirectCall} 
              className="w-full flex items-center gap-2"
              disabled={isLoading}
            >
              <Download className="h-4 w-4" />
              Test Direct API Call
            </Button>
            <Button 
              onClick={testImportFunction} 
              className="w-full flex items-center gap-2"
              disabled={isLoading}
              variant="outline"
            >
              <Upload className="h-4 w-4" />
              Test Import Function
            </Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Response 
              {statusCode !== null && (
                statusCode >= 200 && statusCode < 300 ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                )
              )}
            </CardTitle>
            
            {statusCode !== null && (
              <CardDescription className="mt-2">
                Status: {statusCode} {statusCode >= 200 && statusCode < 300 ? 'OK' : 'Error'}
              </CardDescription>
            )}
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <Tabs defaultValue="direct" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="direct" className="flex-1">Direct API</TabsTrigger>
                <TabsTrigger value="import" className="flex-1">Import Function</TabsTrigger>
              </TabsList>
              
              <TabsContent value="direct" className="mt-4">
                <div className="bg-gray-50 p-4 rounded-md overflow-auto max-h-[500px]">
                  <pre className="text-sm">
                    {directResponse ? JSON.stringify(directResponse, null, 2) : 'No direct API response yet'}
                  </pre>
                </div>
              </TabsContent>
              
              <TabsContent value="import" className="mt-4">
                <div className="bg-gray-50 p-4 rounded-md overflow-auto max-h-[500px]">
                  <pre className="text-sm">
                    {importResponse ? JSON.stringify(importResponse, null, 2) : 'No import function response yet'}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default APITester;
