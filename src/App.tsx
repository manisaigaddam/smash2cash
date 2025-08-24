import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { WalletProvider } from "@/components/WalletProvider";
import { ReactTogether } from "react-together";
import { useState, createContext } from "react";
import LandscapeOverlay from "./components/LandscapeOverlay";

export const SessionParamsContext = createContext({
  setSessionName: (_: string | null) => {},
  setSessionPassword: (_: string | null) => {},
});

const queryClient = new QueryClient();

const App = () => {
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [sessionPassword, setSessionPassword] = useState<string | null>(null);

  return (
    <SessionParamsContext.Provider value={{ setSessionName, setSessionPassword }}>
      <ReactTogether
        sessionParams={{
          appId: import.meta.env.VITE_MULTISYNQ_APP_ID,
          apiKey: import.meta.env.VITE_MULTISYNQ_API_KEY,
          name: sessionName || undefined,
          password: sessionPassword || undefined,
        }}
        rememberUsers={true}
      >
        <WalletProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <LandscapeOverlay>
                <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
              </LandscapeOverlay>
            </TooltipProvider>
          </QueryClientProvider>
        </WalletProvider>
      </ReactTogether>
    </SessionParamsContext.Provider>
  );
};

export default App;
