import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  AppState,
  ScrollView,
  SafeAreaView,
  StatusBar,
  BackHandler,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Types
interface Settings {
  timeLimit: number; // in minutes
  warningMessage: string;
  lockDuration: number; // in minutes
}

export default function App() {
  const [currentSessionTime, setCurrentSessionTime] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [totalTodayTime, setTotalTodayTime] = useState(0);
  const [settings, setSettings] = useState<Settings>({
    timeLimit: 180, // 3 hours default
    warningMessage: "youre wasting too much time MR doom pants",
    lockDuration: 30, // 30 minutes default
  });
  const [isLocked, setIsLocked] = useState(false);
  const [lockEndTime, setLockEndTime] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  // Initialize app
  useEffect(() => {
    // Request notification permissions
    registerForPushNotificationsAsync();

    // Load settings and data
    loadSettings();
    loadTodayData();

    // Handle notification responses
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Handle notification received
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {
      // Handle notification tap
    });

    // Handle app state changes
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active' && isTracking) {
        resumeTracking();
      } else if (nextAppState === 'background' && isTracking) {
        pauseTracking();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
      notificationListener.current && Notifications.removeNotificationSubscription(notificationListener.current);
      responseListener.current && Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isTracking && sessionStartTime && !isLocked) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - sessionStartTime) / 1000);
        setCurrentSessionTime(elapsed);

        // Check if we've hit the time limit
        const totalSeconds = totalTodayTime + elapsed;
        if (totalSeconds >= settings.timeLimit * 60) {
          triggerTimeLimit();
        }
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isTracking, sessionStartTime, totalTodayTime, settings.timeLimit, isLocked]);

  // Lock timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isLocked && lockEndTime) {
      interval = setInterval(() => {
        const now = Date.now();
        if (now >= lockEndTime) {
          unlockApp();
        }
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isLocked, lockEndTime]);

  // Back button handler for lock screen
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isLocked) {
        return true; // Prevent back navigation when locked
      }
      return false;
    });

    return () => backHandler.remove();
  }, [isLocked]);

  // Keep awake when tracking
  useEffect(() => {
    if (isTracking) {
      activateKeepAwake();
    } else {
      deactivateKeepAwake();
    }

    return () => {
      deactivateKeepAwake();
    };
  }, [isTracking]);

  const registerForPushNotificationsAsync = async () => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      alert('Failed to get push token for push notification!');
      return;
    }
  };

  const loadSettings = async () => {
    try {
      const savedSettings = await SecureStore.getItemAsync('gameTimeSettings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async (newSettings: Settings) => {
    try {
      await SecureStore.setItemAsync('gameTimeSettings', JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const loadTodayData = async () => {
    try {
      const today = new Date().toDateString();
      const todayData = await SecureStore.getItemAsync(`gameTime_${today}`);
      if (todayData) {
        setTotalTodayTime(parseInt(todayData, 10));
      }
    } catch (error) {
      console.error('Error loading today data:', error);
    }
  };

  const saveTodayData = async (timeToAdd: number) => {
    try {
      const today = new Date().toDateString();
      const newTotal = totalTodayTime + timeToAdd;
      await SecureStore.setItemAsync(`gameTime_${today}`, newTotal.toString());
      setTotalTodayTime(newTotal);
    } catch (error) {
      console.error('Error saving today data:', error);
    }
  };

  const startTracking = () => {
    if (isLocked) return;

    const now = Date.now();
    setSessionStartTime(now);
    setIsTracking(true);
    setCurrentSessionTime(0);
  };

  const stopTracking = () => {
    if (!isTracking || !sessionStartTime) return;

    const now = Date.now();
    const sessionDuration = Math.floor((now - sessionStartTime) / 1000);

    saveTodayData(sessionDuration);
    setIsTracking(false);
    setSessionStartTime(null);
    setCurrentSessionTime(0);
  };

  const pauseTracking = () => {
    if (!isTracking || !sessionStartTime) return;

    const now = Date.now();
    const sessionDuration = Math.floor((now - sessionStartTime) / 1000);
    saveTodayData(sessionDuration);
    setCurrentSessionTime(0);
  };

  const resumeTracking = () => {
    if (!isTracking) return;

    const now = Date.now();
    setSessionStartTime(now);
  };

  const triggerTimeLimit = async () => {
    // Send notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Time Limit Reached!',
        body: settings.warningMessage,
        sound: 'default',
      },
      trigger: null, // Immediate
    });

    // Show alert and lock
    Alert.alert(
      'Time Limit Reached!',
      settings.warningMessage,
      [
        {
          text: 'OK',
          onPress: () => lockApp(),
        },
      ],
      { cancelable: false }
    );
  };

  const lockApp = () => {
    const lockEnd = Date.now() + (settings.lockDuration * 60 * 1000);
    setLockEndTime(lockEnd);
    setIsLocked(true);
    setIsTracking(false);
    setSessionStartTime(null);
    setCurrentSessionTime(0);
  };

  const unlockApp = () => {
    setIsLocked(false);
    setLockEndTime(null);
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const formatTimeLimit = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    } else {
      return `${mins}m`;
    }
  };

  const getRemainingLockTime = (): string => {
    if (!lockEndTime) return '';

    const remaining = Math.max(0, Math.floor((lockEndTime - Date.now()) / 1000));
    return formatTime(remaining);
  };

  if (isLocked) {
    return (
      <SafeAreaView style={styles.lockedContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#ff4444" />
        <View style={styles.lockContent}>
          <Ionicons name="lock-closed" size={80} color="white" />
          <Text style={styles.lockTitle}>GAME TIME LOCKED</Text>
          <Text style={styles.lockMessage}>{settings.warningMessage}</Text>
          <Text style={styles.lockTimer}>
            Time remaining: {getRemainingLockTime()}
          </Text>
          <Text style={styles.lockSubtext}>
            Take a break! You can resume gaming when the timer ends.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (showSettings) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <ScrollView style={styles.scrollView}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setShowSettings(false)}
            >
              <Ionicons name="arrow-back" size={24} color="#2196F3" />
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Settings</Text>
          </View>

          <View style={styles.settingsContainer}>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>Time Limit</Text>
              <Text style={styles.settingValue}>{formatTimeLimit(settings.timeLimit)}</Text>
              <View style={styles.settingButtons}>
                <TouchableOpacity
                  style={styles.settingButton}
                  onPress={() => saveSettings({...settings, timeLimit: Math.max(30, settings.timeLimit - 30)})}
                >
                  <Text style={styles.settingButtonText}>-30m</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.settingButton}
                  onPress={() => saveSettings({...settings, timeLimit: settings.timeLimit + 30})}
                >
                  <Text style={styles.settingButtonText}>+30m</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>Lock Duration</Text>
              <Text style={styles.settingValue}>{formatTimeLimit(settings.lockDuration)}</Text>
              <View style={styles.settingButtons}>
                <TouchableOpacity
                  style={styles.settingButton}
                  onPress={() => saveSettings({...settings, lockDuration: Math.max(10, settings.lockDuration - 10)})}
                >
                  <Text style={styles.settingButtonText}>-10m</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.settingButton}
                  onPress={() => saveSettings({...settings, lockDuration: settings.lockDuration + 10})}
                >
                  <Text style={styles.settingButtonText}>+10m</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>Warning Message</Text>
              <Text style={styles.settingDescription}>"{settings.warningMessage}"</Text>
              <TouchableOpacity
                style={styles.messageButton}
                onPress={() => {
                  Alert.prompt(
                    'Custom Message',
                    'Enter your custom warning message:',
                    (text) => {
                      if (text && text.trim()) {
                        saveSettings({...settings, warningMessage: text.trim()});
                      }
                    },
                    'plain-text',
                    settings.warningMessage
                  );
                }}
              >
                <Text style={styles.messageButtonText}>Change Message</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>🎮 Game Time Tracker</Text>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => setShowSettings(true)}
          >
            <Ionicons name="settings" size={20} color="white" />
            <Text style={styles.settingsButtonText}>Settings</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Current Session</Text>
            <Text style={styles.statValue}>{formatTime(currentSessionTime)}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Today Total</Text>
            <Text style={styles.statValue}>{formatTime(totalTodayTime + currentSessionTime)}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Daily Limit</Text>
            <Text style={styles.statValue}>{formatTimeLimit(settings.timeLimit)}</Text>
          </View>
        </View>

        <View style={styles.progressContainer}>
          <Text style={styles.progressLabel}>Daily Progress</Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(100, ((totalTodayTime + currentSessionTime) / (settings.timeLimit * 60)) * 100)}%`,
                  backgroundColor: ((totalTodayTime + currentSessionTime) / (settings.timeLimit * 60)) >= 1 ? '#ff4444' : '#4CAF50'
                }
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {Math.round(((totalTodayTime + currentSessionTime) / (settings.timeLimit * 60)) * 100)}% of daily limit
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          {!isTracking ? (
            <TouchableOpacity style={styles.startButton} onPress={startTracking}>
              <Ionicons name="play" size={24} color="white" />
              <Text style={styles.buttonText}>Start Gaming Session</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stopButton} onPress={stopTracking}>
              <Ionicons name="stop" size={24} color="white" />
              <Text style={styles.buttonText}>End Gaming Session</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>How it works:</Text>
          <Text style={styles.infoText}>
            • Tap "Start Gaming Session" when you begin playing games{'\n'}
            • The app tracks your gaming time and keeps your screen awake{'\n'}
            • When you reach your daily limit, you'll get a notification{'\n'}
            • The app will then lock for the specified duration{'\n'}
            • Customize your time limits and messages in Settings
          </Text>
        </View>

        <View style={styles.expoInfo}>
          <Text style={styles.expoInfoTitle}>📱 Testing with Expo</Text>
          <Text style={styles.expoInfoText}>
            Download "Expo Go" app and scan the QR code to test on your phone!
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  lockedContainer: {
    flex: 1,
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockContent: {
    padding: 30,
    alignItems: 'center',
  },
  lockTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 20,
    marginBottom: 20,
    textAlign: 'center',
  },
  lockMessage: {
    fontSize: 24,
    color: 'white',
    marginBottom: 30,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  lockTimer: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
  },
  lockSubtext: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    opacity: 0.9,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#2196F3',
    borderRadius: 8,
  },
  settingsButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 5,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  backButtonText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 5,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
  },
  statCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 100,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  progressContainer: {
    margin: 20,
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  progressLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  progressBar: {
    height: 20,
    backgroundColor: '#e0e0e0',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 10,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  buttonContainer: {
    padding: 20,
  },
  startButton: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  stopButton: {
    flexDirection: 'row',
    backgroundColor: '#ff4444',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  infoContainer: {
    margin: 20,
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#666',
  },
  expoInfo: {
    margin: 20,
    backgroundColor: '#4630EB',
    padding: 20,
    borderRadius: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  expoInfoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: 'white',
  },
  expoInfoText: {
    fontSize: 14,
    lineHeight: 20,
    color: 'white',
    opacity: 0.9,
  },
  settingsContainer: {
    padding: 20,
  },
  settingItem: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  settingValue: {
    fontSize: 18,
    color: '#2196F3',
    marginBottom: 10,
    fontWeight: '600',
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  settingButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  settingButton: {
    backgroundColor: '#2196F3',
    padding: 10,
    borderRadius: 5,
    marginHorizontal: 5,
    minWidth: 60,
    alignItems: 'center',
  },
  settingButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  messageButton: {
    backgroundColor: '#FF9800',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  messageButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});
