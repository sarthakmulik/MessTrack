import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../theme/tokens';

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen';

// Super Admin screens
import SuperDashboardScreen from '../screens/superadmin/SuperDashboardScreen';
import CreateMessScreen from '../screens/superadmin/CreateMessScreen';

// Mess Admin screens
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import StudentsScreen from '../screens/admin/StudentsScreen';
import AddStudentScreen from '../screens/admin/AddStudentScreen';
import PlansScreen from '../screens/admin/PlansScreen';
import AddPlanScreen from '../screens/admin/AddPlanScreen';
import SessionsScreen from '../screens/admin/SessionsScreen';
import QRDisplayScreen from '../screens/admin/QRDisplayScreen';
import AdminAttendanceScreen from '../screens/admin/AdminAttendanceScreen';
import BillingScreen from '../screens/admin/BillingScreen';

// Student screens
import StudentDashboardScreen from '../screens/student/StudentDashboardScreen';
import ScanScreen from '../screens/student/ScanScreen';
import AttendanceHistoryScreen from '../screens/student/AttendanceHistoryScreen';
import LeaveScreen from '../screens/student/LeaveScreen';
import StudentInvoicesScreen from '../screens/student/StudentInvoicesScreen';

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.text,
  headerTitleStyle: { fontWeight: '700' as const },
  contentStyle: { backgroundColor: Colors.background },
};

function SuperAdminNavigator() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="SuperDashboard"
        component={SuperDashboardScreen}
        options={{ title: 'MessTrack Admin' }}
      />
      <Stack.Screen
        name="CreateMess"
        component={CreateMessScreen}
        options={{ title: 'Create New Mess' }}
      />
    </Stack.Navigator>
  );
}

function AdminNavigator() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <Stack.Screen name="Students" component={StudentsScreen} options={{ title: 'Students' }} />
      <Stack.Screen name="AddStudent" component={AddStudentScreen} options={{ title: 'Add Student' }} />
      <Stack.Screen name="Plans" component={PlansScreen} options={{ title: 'Subscription Plans' }} />
      <Stack.Screen name="AddPlan" component={AddPlanScreen} options={{ title: 'New Plan' }} />
      <Stack.Screen name="Sessions" component={SessionsScreen} options={{ title: 'Meal Sessions' }} />
      <Stack.Screen
        name="QRDisplay"
        component={QRDisplayScreen}
        options={{ title: 'Live QR', headerShown: false }}
      />
      <Stack.Screen
        name="AdminAttendance"
        component={AdminAttendanceScreen}
        options={{ title: 'Attendance' }}
      />
      <Stack.Screen name="Billing" component={BillingScreen} options={{ title: 'Billing & Invoices' }} />
    </Stack.Navigator>
  );
}

function StudentNavigator() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="StudentDashboard"
        component={StudentDashboardScreen}
        options={{ title: 'My Mess' }}
      />
      <Stack.Screen
        name="Scan"
        component={ScanScreen}
        options={{ title: 'Scan QR', headerShown: false }}
      />
      <Stack.Screen
        name="AttendanceHistory"
        component={AttendanceHistoryScreen}
        options={{ title: 'My Attendance' }}
      />
      <Stack.Screen name="Leave" component={LeaveScreen} options={{ title: 'Mark Leave' }} />
      <Stack.Screen
        name="StudentInvoices"
        component={StudentInvoicesScreen}
        options={{ title: 'My Bills' }}
      />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { session, role, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!session ? (
        // Not logged in — show auth
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      ) : role === 'super_admin' ? (
        <SuperAdminNavigator />
      ) : role === 'mess_admin' ? (
        <AdminNavigator />
      ) : (
        <StudentNavigator />
      )}
    </NavigationContainer>
  );
}
