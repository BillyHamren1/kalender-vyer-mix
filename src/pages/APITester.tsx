
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { AlertCircle, ArrowRight, CheckCircle2, Key, Globe } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogClose
} from "@/components/ui/dialog";

const APITester = () => {
  const [response, setResponse] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clientName, setClientName] = useState('');
  const [requestUrl, setRequestUrl] = useState('');
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState(false);
  
  const testDirectCall = async () => {
    try {
      setIsLoading(true);
      toast.info('Testing direct API call...');
      
      // Get the API key from the Supabase secrets
      const { data: secretData, error: secretError } = await supabase.functions.invoke(
        'get-api-key',
        {
          method: 'POST',
        }
      );
      
      if (secretError) {
        throw new Error(`Failed to get API key: ${secretError.message}`);
      }
      
      if (!secretData || !secretData.apiKey) {
        throw new Error('API key not found in response');
      }
      
      // Store the API key for display
      setApiKey(secretData.apiKey);
      
      // Build the URL
      const apiUrl = new URL("https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings");
      
      // Add query parameters if provided
      if (startDate) apiUrl.searchParams.append('startDate', startDate);
      if (endDate) apiUrl.searchParams.append('endDate', endDate);
      if (clientName) apiUrl.searchParams.append('client', clientName);
      
      // Store the URL for display - make sure this is set before the API call
      setRequestUrl(apiUrl.toString());
      
      // Make the API call with the x-api-key header
      const response = await fetch(apiUrl.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': secretData.apiKey,
          'Content-Type': 'application/json',
        },
      });
      
      setStatusCode(response.status);
      
      // Parse the response
      const responseData = await response.json();
      setResponse(responseData);
      
      if (response.ok) {
        toast.success('API call successful!', {
          description: `Received ${responseData.count || 0} bookings`
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
      setResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
      setStatusCode(500);
    } finally {
      setIsLoading(false);
    }
  };
  
  const testImportFunction = async () => {
    try {
      setIsLoading(true);
      toast.info('Testing import-bookings function...');
      
      // Get the API key for display first
      const { data: secretData, error: secretError } = await supabase.functions.invoke(
        'get-api-key',
        {
          method: 'POST',
        }
      );
      
      if (secretError) {
        console.error('Error getting API key:', secretError);
      } else if (secretData && secretData.apiKey) {
        setApiKey(secretData.apiKey);
      }
      
      // Build the URL that would be used
      const apiUrl = new URL("https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings");
      if (startDate) apiUrl.searchParams.append('startDate', startDate);
      if (endDate) apiUrl.searchParams.append('endDate', endDate);
      if (clientName) apiUrl.searchParams.append('client', clientName);
      
      // Set the URL for display before making the API call
      setRequestUrl(apiUrl.toString());
      
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
      
      setResponse(data);
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
      setResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
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
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button 
              onClick={testDirectCall} 
              className="w-full"
              disabled={isLoading}
            >
              Test Direct API Call
            </Button>
            <Button 
              onClick={testImportFunction} 
              className="w-full"
              disabled={isLoading}
              variant="outline"
            >
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
            
            {/* Always show API information boxes, just empty if not populated */}
            <div className="bg-gray-100 p-2 rounded mt-2 break-all">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-4 w-4 text-gray-600" />
                <span className="font-medium">Request URL:</span>
              </div>
              <div className="pl-6 text-sm">{requestUrl || "No request made yet"}</div>
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
                  ? (showApiKey ? apiKey : "●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●") 
                  : "No API key retrieved yet"}
              </div>
            </div>
            
            {statusCode !== null && (
              <CardDescription className="mt-2">
                Status: {statusCode} {statusCode >= 200 && statusCode < 300 ? 'OK' : 'Error'}
              </CardDescription>
            )}
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <div className="bg-gray-50 p-4 rounded-md overflow-auto max-h-[500px]">
              <pre className="text-sm">
                {response ? JSON.stringify(response, null, 2) : 'No response yet'}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default APITester;
