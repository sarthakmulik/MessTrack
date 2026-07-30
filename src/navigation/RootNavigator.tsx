import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, Text, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Colors, FontSize, FontWeight } from '../theme/tokens';

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
import MealSettingsScreen from '../screens/admin/MealSettingsScreen';
import PaymentSettingsScreen from '../screens/admin/PaymentSettingsScreen';
import MenuScreen from '../screens/admin/MenuScreen';

// Student screens
import StudentDashboardScreen from '../screens/student/StudentDashboardScreen';
import ScanScreen from '../screens/student/ScanScreen';
import AttendanceHistoryScreen from '../screens/student/AttendanceHistoryScreen';
import LeaveScreen from '../screens/student/LeaveScreen';
import StudentInvoicesScreen from '../screens/student/StudentInvoicesScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const stackScreenOptions = {
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.text,
  headerTitleStyle: { fontWeight: '700' as const, fontSize: FontSize.md },
  contentStyle: { backgroundColor: Colors.background },
  headerShadowVisible: false,
};

// ─────────────────────────────────────────────
// SUPER ADMIN
// ─────────────────────────────────────────────
function SuperAdminNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
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

// ─────────────────────────────────────────────
// MESS ADMIN
// ─────────────────────────────────────────────
function AdminNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ headerShown: false }}
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
      <Stack.Screen name="AdminAttendance" component={AdminAttendanceScreen} options={{ title: 'Attendance' }} />
      <Stack.Screen name="Billing" component={BillingScreen} options={{ title: 'Billing & Invoices' }} />
      <Stack.Screen name="MealSettings" component={MealSettingsScreen} options={{ title: 'Meal Settings' }} />
      <Stack.Screen name="PaymentSettings" component={PaymentSettingsScreen} options={{ title: 'Payment Setup' }} />
      <Stack.Screen name="Menu" component={MenuScreen} options={{ title: "Today's Menu" }} />
    </Stack.Navigator>
  );
}

// ─────────────────────────────────────────────
// STUDENT — Bottom Tab Navigation
// ─────────────────────────────────────────────

// Each tab gets its own mini stack so we can push screens from within tabs
function HomeTab() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="StudentDashboard"
        component={StudentDashboardScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function ScanTab() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="Scan"
        component={ScanScreen}
        options={{ title: 'Scan QR', headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function HistoryTab() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="AttendanceHistory"
        component={AttendanceHistoryScreen}
        options={{ title: 'My Attendance' }}
      />
    </Stack.Navigator>
  );
}

function LeaveTab() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="Leave"
        component={LeaveScreen}
        options={{ title: 'Skip Meal' }}
      />
    </Stack.Navigator>
  );
}

function BillsTab() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="StudentInvoices"
        component={StudentInvoicesScreen}
        options={{ title: 'My Bills' }}
      />
    </Stack.Navigator>
  );
}

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
  );
}

function StudentNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 85 : 65,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600' as const,
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeTab}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ScanTab"
        component={ScanTab}
        options={{
          tabBarLabel: 'Scan QR',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📷" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="HistoryTab"
        component={HistoryTab}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="LeaveTab"
        component={LeaveTab}
        options={{
          tabBarLabel: 'Skip Meal',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🚫" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="BillsTab"
        component={BillsTab}
        options={{
          tabBarLabel: 'Bills',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🧾" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ─────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────
export default function RootNavigator() {
  const { session, role, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}
      >
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.textMuted, marginTop: 16, fontSize: FontSize.sm }}>
          Loading MessTrack...
        </Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!session ? (
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
