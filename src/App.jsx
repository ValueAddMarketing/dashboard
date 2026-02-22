import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { useClients } from './hooks/useClients';
import { Sidebar, Header, LoginPage, ErrorBoundary } from './components';
import { RedFlagsPage, ClientHealthPage, NotesActivityPage, OverviewPage } from './pages';
import { CLIENT_HUB_TABS } from './utils/constants';

/**
 * Main application layout
 */
const AppLayout = () => {
  const { user, loading: authLoading } = useAuth();
  const { clients, setupData, loading: dataLoading, getSetupInfo } = useClients();
  const [selectedClient, setSelectedClient] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Get client from URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clientParam = params.get('client');
    if (clientParam && clients.length > 0) {
      const found = clients.find(c =>
        c.client.toLowerCase() === decodeURIComponent(clientParam).toLowerCase()
      );
      if (found) setSelectedClient(found);
    }
  }, [clients]);

  const handleSelectClient = (client) => {
    setSelectedClient(client);
    // Navigate to health tab when selecting a client from overview or redflags
    if (location.pathname.includes('redflags') || location.pathname.includes('overview')) {
      navigate('/client/health');
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-4xl">
        ⏳
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return <LoginPage />;
  }

  // Show loading while fetching data
  if (dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-4xl">
        ⏳
      </div>
    );
  }

  const setup = getSetupInfo(selectedClient);
  const currentTab = location.pathname.split('/').pop() || 'redflags';
  const headerTitle = currentTab === 'overview' ? '📊 Overview' : currentTab === 'redflags' ? '🚩 Red Flags Dashboard' : undefined;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        clients={clients}
        setupData={setupData}
        selectedClient={selectedClient}
        onSelectClient={handleSelectClient}
        tabs={CLIENT_HUB_TABS}
      />
      <main className="flex-1 flex flex-col">
        <Header
          client={selectedClient}
          setup={setup}
          title={headerTitle}
        />
        <div className="flex-1 overflow-y-auto p-8 scrollbar">
          <ErrorBoundary>
          <Routes>
            <Route
              path="overview"
              element={
                <OverviewPage
                  clients={clients}
                  setupData={setupData}
                  onSelectClient={handleSelectClient}
                />
              }
            />
            <Route
              path="redflags"
              element={
                <RedFlagsPage
                  clients={clients}
                  setupData={setupData}
                  onSelectClient={handleSelectClient}
                />
              }
            />
            <Route
              path="health"
              element={
                <ClientHealthPage
                  client={selectedClient}
                  setup={setup}
                />
              }
            />
            <Route
              path="notes"
              element={
                <NotesActivityPage
                  client={selectedClient}
                />
              }
            />
            <Route path="*" element={<Navigate to="overview" replace />} />
          </Routes>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
};

/**
 * Root App component with providers
 */
const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Routes>
            <Route path="/client/*" element={<AppLayout />} />
            <Route path="*" element={<Navigate to="/client/overview" replace />} />
          </Routes>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
