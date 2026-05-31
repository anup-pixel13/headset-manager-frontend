import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';
import SessionExpiringModal from './components/SessionExpiringModal';
import ScrollToTop from './components/ScrollToTop';
import ProcessChange from './pages/ProcessChange';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import AssignHeadset from './pages/AssignHeadset';
import CreateAgent from './pages/CreateAgent';
import AddHeadset from './pages/AddHeadset';
import PendingActions from './pages/PendingActions';
import AssignmentSign from './pages/AssignmentSign';
import Refunds from './pages/Refunds';
import YJacks from './pages/YJacks';
import DeassignAgent from './pages/DeassignAgent';
import Agents from './pages/Agents';
import Repairs from './pages/Repairs';
import RepairReplacements from './pages/RepairReplacements';
import StartRepairReplacement from './pages/StartRepairReplacement';
import HeadsetDetails from './pages/HeadsetDetails';
import HeadsetAssignmentHistory from './pages/HeadsetAssignmentHistory';
import HeadsetRepairHistory from './pages/HeadsetRepairHistory';
import AssignmentDetails from './pages/AssignmentDetails';

// TEMP placeholders (until we build each page)
const ComingSoon = ({ title }) => (
  <div style={{ padding: 30, fontFamily: "'Trebuchet MS', Verdana, sans-serif" }}>
    <h2>{title}</h2>
    <p>Coming soon…</p>
  </div>
);

const App = () => {
  return (
    <AuthProvider>
      <SessionExpiringModal />
      <ScrollToTop />

      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/inventory"
          element={
            <ProtectedRoute>
              <Inventory />
            </ProtectedRoute>
          }
        />

        {/* replace the ComingSoon route for /assign-headset */}
        <Route
          path="/assign-headset"
          element={
            <ProtectedRoute>
              <AssignHeadset />
            </ProtectedRoute>
          }
        />

        <Route
          path="/create-agent"
          element={
            <ProtectedRoute>
              <CreateAgent />
            </ProtectedRoute>
          }
        />

        <Route
          path="/add-headset"
          element={
            <ProtectedRoute>
              <AddHeadset />
            </ProtectedRoute>
          }
        />

        <Route
          path="/pending"
          element={
            <ProtectedRoute>
              <PendingActions />
            </ProtectedRoute>
          }
        />

        <Route
          path="/assignments/:id/sign"
          element={
            <ProtectedRoute>
              <AssignmentSign />
            </ProtectedRoute>
          }
        />

        {/* ✅ NEW: Y-Jacks page */}
        <Route
          path="/yjacks"
          element={
            <ProtectedRoute>
              <YJacks />
            </ProtectedRoute>
          }
        />

        <Route
          path="/transfers"
          element={
            <ProtectedRoute>
              <ComingSoon title="Transfers" />
            </ProtectedRoute>
          }
        />
		<Route
		  path="/process-change"
		  element={
		    <ProtectedRoute>
		      <ProcessChange />
		    </ProtectedRoute>
		  }
		/>
		<Route
		  path="/repairs/start"
		  element={
		    <ProtectedRoute>
		      <StartRepairReplacement />
		    </ProtectedRoute>
		  }
		/>
		<Route
		  path="/repairs"
		  element={
		    <ProtectedRoute>
		      <Repairs />
		    </ProtectedRoute>
		  }
		/>

		<Route
		  path="/repairs/replacements"
		  element={
		    <ProtectedRoute>
		      <RepairReplacements />
		    </ProtectedRoute>
		  }
		/>
		<Route
		  path="/agents"
		  element={
		    <ProtectedRoute>
		      <Agents />
		    </ProtectedRoute>
		  }
		/>
        <Route
          path="/deposits"
          element={
            <ProtectedRoute>
              <ComingSoon title="Deposits" />
            </ProtectedRoute>
          }
        />
		<Route
		  path="/refunds"
		  element={
		    <ProtectedRoute>
		      <Refunds />
		    </ProtectedRoute>
		  }
		/>
		<Route
		  path="/agents/:id/deassign"
		  element={
		    <ProtectedRoute>
		      <DeassignAgent />
		    </ProtectedRoute>
		  }
		/>
        <Route
          path="/pdf-documents"
          element={
            <ProtectedRoute>
              <ComingSoon title="All PDF Documents" />
            </ProtectedRoute>
          }
        />
		<Route
		  path="/headsets/:id"
		  element={
		    <ProtectedRoute>
		      <HeadsetDetails />
		    </ProtectedRoute>
		  }
		/>

		<Route
		  path="/headsets/:id/assignments"
		  element={
		    <ProtectedRoute>
		      <HeadsetAssignmentHistory />
		    </ProtectedRoute>
		  }
		/>

		<Route
		  path="/headsets/:id/repairs"
		  element={
		    <ProtectedRoute>
		      <HeadsetRepairHistory />
		    </ProtectedRoute>
		  }
		/>

		<Route
		  path="/assignments/:id"
		  element={
		    <ProtectedRoute>
		      <AssignmentDetails />
		    </ProtectedRoute>
		  }
		/>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
};

export default App;