import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 7;
const STORAGE_KEY = 'poker-tallies-current-game';
const HISTORY_KEY = 'poker-tallies-history';
const BUBBLE_AMOUNT = 10; // $10 per player for bubble

interface Player {
  name: string;
  chips: number;
  rowie: number;
}

interface Hand {
  playerResults: number[];
  date: string;
}

interface RowieSettings {
  startHand: number;
  numHands: number;
  potAmount: number;
  currentHand: number;
  isComplete: boolean;
}

interface GameRound {
  date: string;
  playerNames: string[];
  finalChips: number[];
  rowiePoints: number[];
  rowiePayouts: number[];
  bubblePayouts: number[];
  rowieSettings: RowieSettings;
  hands: Hand[];
  completedRowies: CompletedRowie[];
}

interface SavedGame {
  step: number;
  numPlayers: number;
  playerNames: string[];
  chips: number[];
  rowie: number[];
  rowieSettings: RowieSettings;
  hands: Hand[];
  currentHandIndex: number;
  lastSaved: string;
}

interface CompletedRowie {
  rowieNumber: number;
  startHand: number;
  endHand: number;
  value: number;
  winners: string[];
}

export default function App() {
  const [step, setStep] = useState<number>(1);
  const [numPlayers, setNumPlayers] = useState<number>(2);
  const [playerNames, setPlayerNames] = useState<string[]>(Array(2).fill(''));
  const [chips, setChips] = useState<number[]>(Array(2).fill(0));
  const [rowie, setRowie] = useState<number[]>(Array(2).fill(0));
  const [rowieSettings, setRowieSettings] = useState<RowieSettings>({
    startHand: 0,
    numHands: 0,
    potAmount: 5,
    currentHand: 0,
    isComplete: false
  });
  const [history, setHistory] = useState<GameRound[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<GameRound | null>(null);
  const [hands, setHands] = useState<Hand[]>([]);
  const [currentHandIndex, setCurrentHandIndex] = useState<number>(-1);
  const [handResults, setHandResults] = useState<number[]>(Array(2).fill(0));
  const [explicitlyEntered, setExplicitlyEntered] = useState<boolean[]>(Array(2).fill(false));
  const [showSummary, setShowSummary] = useState(false);
  const [mercyApplied, setMercyApplied] = useState(false);
  const [preMercyChips, setPreMercyChips] = useState<number[]>([]);
  const [completedRowies, setCompletedRowies] = useState<CompletedRowie[]>([]);

  // Load saved game and history on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedGame = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedGame) {
          const data: SavedGame = JSON.parse(savedGame);
          const lastSaved = new Date(data.lastSaved);
          const now = new Date();
          const hoursDiff = (now.getTime() - lastSaved.getTime()) / (1000 * 60 * 60);
          
          if (hoursDiff < 24) {
            setStep(data.step);
            setNumPlayers(data.numPlayers);
            setPlayerNames(data.playerNames);
            setChips(data.chips);
            setRowie(data.rowie);
            setRowieSettings(data.rowieSettings);
            setHands(data.hands);
            setCurrentHandIndex(data.currentHandIndex);
          } else {
            await AsyncStorage.removeItem(STORAGE_KEY);
          }
        }
        const savedHistory = await AsyncStorage.getItem(HISTORY_KEY);
        if (savedHistory) {
          setHistory(JSON.parse(savedHistory));
        }
      } catch (e) {
        console.error('Error loading data:', e);
      }
    };
    loadData();
  }, []);

  // Auto-save current game state
  useEffect(() => {
    const saveData = async () => {
      try {
        const gameData = {
          step,
          numPlayers,
          playerNames,
          chips,
          rowie,
          rowieSettings,
          hands,
          currentHandIndex,
          lastSaved: new Date().toISOString()
        };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(gameData));
      } catch (e) {
        console.error('Error saving game:', e);
      }
    };
    if (playerNames.some(name => name.trim() !== '')) {
      saveData();
    }
  }, [step, numPlayers, playerNames, chips, rowie, rowieSettings, hands, currentHandIndex]);

  // Calculate Rowie payouts
  const calculateRowiePayouts = (rowiePoints: number[]): number[] => {
    const payouts = Array(numPlayers).fill(0);
    const totalPoints = rowiePoints.reduce((sum, points) => sum + points, 0);
    const potSize = numPlayers * rowieSettings.potAmount;

    rowiePoints.forEach((points, idx) => {
      if (points > 0) {
        payouts[idx] = Math.round((points / totalPoints) * potSize);
      }
    });

    return payouts;
  };

  // Calculate bubble payouts
  const calculateBubblePayouts = (finalChips: number[]): number[] => {
    const payouts = Array(numPlayers).fill(0);
    
    // Create array of player indices with their chip counts
    const playerChips = finalChips.map((chips, index) => ({ chips, index }));
    
    // Group players by their chip amounts
    const groupedPlayers = playerChips.reduce((groups, player) => {
      const key = player.chips;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(player);
      return groups;
    }, {} as { [key: number]: typeof playerChips });

    // Sort chip amounts in descending order
    const sortedChipAmounts = Object.keys(groupedPlayers)
      .map(Number)
      .sort((a, b) => b - a);

    // Calculate payouts
    sortedChipAmounts.forEach((chipAmount, rank) => {
      const playersAtThisRank = groupedPlayers[chipAmount];
      
      // Calculate how many players are above and below this rank
      const playersAbove = sortedChipAmounts
        .slice(0, rank)
        .reduce((sum, amount) => sum + groupedPlayers[amount].length, 0);
      
      const playersBelow = sortedChipAmounts
        .slice(rank + 1)
        .reduce((sum, amount) => sum + groupedPlayers[amount].length, 0);

      // Each player at this rank:
      // - Pays $10 to each player above them
      // - Receives $10 from each player below them
      // - Doesn't pay or receive from players tied with them
      const payoutPerPlayer = (playersBelow * BUBBLE_AMOUNT) - (playersAbove * BUBBLE_AMOUNT);

      // Apply the payout to all players at this rank
      playersAtThisRank.forEach(player => {
        payouts[player.index] = payoutPerPlayer;
      });
    });

    return payouts;
  };

  // Save finished round to history
  const saveToHistory = async () => {
    const rowiePayouts = calculateRowiePayouts(rowie);
    const bubblePayouts = calculateBubblePayouts(chips);
    const round: GameRound = {
      date: new Date().toLocaleString(),
      playerNames: [...playerNames],
      finalChips: [...chips],
      rowiePoints: [...rowie],
      rowiePayouts,
      bubblePayouts,
      rowieSettings: { ...rowieSettings },
      hands: [...hands],
      completedRowies: [...completedRowies]
    };
    const newHistory = [round, ...history];
    setHistory(newHistory);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
  };

  // When number of players changes, reset arrays
  const handleNumPlayers = (n: number) => {
    setNumPlayers(n);
    setPlayerNames(Array(n).fill(''));
    setChips(Array(n).fill(0));
    setRowie(Array(n).fill(0));
    setHandResults(Array(n).fill(0));
    setStep(2);
  };

  // Player name logic
  const handlePlayerName = (idx: number, name: string) => {
    const newNames = [...playerNames];
    newNames[idx] = name;
    setPlayerNames(newNames);
  };

  const handleNamesContinue = () => {
    if (playerNames.some((n) => n.trim() === '')) {
      Alert.alert('Please enter all player names.');
      return;
    }
    // Reset game state when starting with new names
    setChips(Array(numPlayers).fill(0));
    setRowie(Array(numPlayers).fill(0));
    setRowieSettings({
      startHand: 0,
      numHands: 0,
      potAmount: 5,
      currentHand: 0,
      isComplete: false
    });
    setHands([]);
    setCurrentHandIndex(-1);
    setCompletedRowies([]);
    setHandResults(Array(numPlayers).fill(0));
    setShowSummary(false);
    setMercyApplied(false);
    setStep(3);
  };

  // Rowie settings logic
  const handleRowieSettings = (field: keyof RowieSettings, value: string | number) => {
    setRowieSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleNewRowie = () => {
    if (rowieSettings.currentHand > 0) {
      Alert.alert('Please complete the current Rowie before starting a new one.');
      return;
    }
    setStep(4);
  };

  const handleRowieSettingsContinue = () => {
    if (rowieSettings.numHands <= 0 || rowieSettings.potAmount <= 0) {
      Alert.alert('Please fill in all Rowie settings.');
      return;
    }

    Alert.alert(
      'Start New Rowie',
      `Confirm Rowie settings:\n\nStarting at Hand ${hands.length + 1}\nNumber of Hands: ${rowieSettings.numHands}\nValue: $${rowieSettings.potAmount} per player`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Start Rowie',
          onPress: () => {
            setRowieSettings(prev => ({
              ...prev,
              startHand: hands.length,
              currentHand: prev.numHands,
              isComplete: false
            }));
            setStep(3);
          }
        }
      ]
    );
  };

  // Hand result logic
  const handleHandResult = (idx: number, value: string) => {
    const newResults = [...handResults];
    const newExplicitlyEntered = [...explicitlyEntered];
    
    // Handle empty input
    if (value === '') {
      newResults[idx] = 0;
      newExplicitlyEntered[idx] = false;
    } else if (value === '-') {
      // Keep the minus sign for negative numbers
      newResults[idx] = 0;
      newExplicitlyEntered[idx] = true;
    } else {
      // Parse the number, including negative numbers and zero
      const numValue = parseInt(value);
      newResults[idx] = isNaN(numValue) ? 0 : numValue;
      newExplicitlyEntered[idx] = true;
    }
    setHandResults(newResults);
    setExplicitlyEntered(newExplicitlyEntered);
  };

  const toggleNegative = (idx: number) => {
    const newResults = [...handResults];
    newResults[idx] = -newResults[idx];
    setHandResults(newResults);
  };

  const handleSubmitHand = () => {
    const total = handResults.reduce((sum, result) => sum + result, 0);
    if (total !== 0) {
      Alert.alert('Error', 'Hand results must sum to zero.');
      return;
    }

    const newHand: Hand = {
      playerResults: [...handResults],
      date: new Date().toLocaleString()
    };

    const newHands = [...hands, newHand];
    setHands(newHands);
    setCurrentHandIndex(newHands.length - 1);

    // Update chip totals
    const newChips = chips.map((chip, idx) => chip + handResults[idx]);
    setChips(newChips);

    // Update Rowie points if Rowie is active
    if (rowieSettings.currentHand > 0) {
      const newRowie = rowie.map((points, idx) => points + handResults[idx]);
      setRowie(newRowie);
      
      // Check if Rowie is complete
      if (rowieSettings.currentHand === 1) {
        // Calculate final Rowie totals including the current hand
        const rowieResults = [...hands.slice(rowieSettings.startHand), newHand];
        const rowieTotals = Array(numPlayers).fill(0);
        
        // Sum up all results for each player
        rowieResults.forEach(result => {
          result.playerResults.forEach((amount, playerIdx) => {
            rowieTotals[playerIdx] += amount;
          });
        });
        
        // Find the maximum points
        const maxPoints = Math.max(...rowieTotals);
        
        // Get all players who tied for first place
        const winners = rowieTotals
          .map((points, idx) => ({ points, idx }))
          .filter(({ points }) => points === maxPoints)
          .map(({ idx }) => playerNames[idx].charAt(0).toUpperCase());

        const newCompletedRowie: CompletedRowie = {
          rowieNumber: completedRowies.length + 1,
          startHand: rowieSettings.startHand + 1,
          endHand: hands.length + 1,
          value: rowieSettings.potAmount,
          winners: winners
        };

        setCompletedRowies([...completedRowies, newCompletedRowie]);
        
        // Mark Rowie as complete but keep it visible
        setRowieSettings(prev => ({
          ...prev,
          currentHand: 0,
          isComplete: true
        }));
      } else {
        setRowieSettings(prev => ({
          ...prev,
          currentHand: prev.currentHand - 1
        }));
      }
    } else if (rowieSettings.isComplete) {
      // Clear the completed Rowie display after the next hand
      setRowieSettings(prev => ({
        ...prev,
        isComplete: false
      }));
    }

    // Reset hand results to empty boxes
    setHandResults(Array(numPlayers).fill(0));
    setExplicitlyEntered(Array(numPlayers).fill(false));
  };

  // Navigation between hands
  const handlePreviousHand = () => {
    if (currentHandIndex > 0) {
      setCurrentHandIndex(currentHandIndex - 1);
      // Update hand results to show the selected hand's values
      setHandResults(hands[currentHandIndex - 1].playerResults);
      // Mark all values as explicitly entered since they were previously entered
      setExplicitlyEntered(Array(numPlayers).fill(true));
    }
  };

  const handleNextHand = () => {
    if (currentHandIndex < hands.length - 1) {
      setCurrentHandIndex(currentHandIndex + 1);
      // Update hand results to show the selected hand's values
      setHandResults(hands[currentHandIndex + 1].playerResults);
      // Mark all values as explicitly entered since they were previously entered
      setExplicitlyEntered(Array(numPlayers).fill(true));
    }
  };

  // Also update the "Current Hand" button handler
  const handleCurrentHand = () => {
    setCurrentHandIndex(hands.length - 1);
    setHandResults(hands[hands.length - 1].playerResults);
    // Mark all values as explicitly entered since they were previously entered
    setExplicitlyEntered(Array(numPlayers).fill(true));
  };

  // Mercy calculation logic
  const handleMercyCalculation = () => {
    // Calculate mercy for each player individually
    const newChips = chips.map(chip => {
      // Apply the formula: chips * 5% /2/2
      const mercyAmount = (chip * 0.05) / 2 / 2;
      // Round to nearest $1
      return Math.round(mercyAmount);
    });

    setChips(newChips);
    setMercyApplied(true);
  };

  // Finish game
  const handleFinish = async () => {
    if (rowieSettings.currentHand > 0) {
      Alert.alert('Please complete the current Rowie before ending the game.');
      return;
    }
    // Store pre-mercy chip totals
    setPreMercyChips([...chips]);
    setShowSummary(true);
  };

  // Load history round
  const loadHistoryRound = (round: GameRound) => {
    try {
      setSelectedHistory(round);
      setPlayerNames(round.playerNames);
      setChips(round.finalChips);
      setRowie(round.rowiePoints);
      setRowieSettings(round.rowieSettings);
      setHands(round.hands);
      setStep(5);
    } catch (error) {
      console.error('Error in loadHistoryRound:', error);
      Alert.alert('Error', 'Unable to load game history. Please try again.');
    }
  };

  // Exit history view
  const exitHistoryView = () => {
    try {
      setSelectedHistory(null);
      setStep(1);
      setNumPlayers(2);
      setPlayerNames(Array(2).fill(''));
      setChips(Array(2).fill(0));
      setRowie(Array(2).fill(0));
      setRowieSettings({
        startHand: 0,
        numHands: 0,
        potAmount: 5,
        currentHand: 0,
        isComplete: false
      });
      setHands([]);
      setCurrentHandIndex(-1);
    } catch (error) {
      console.error('Error in exitHistoryView:', error);
      Alert.alert('Error', 'Unable to exit history view. Please try again.');
    }
  };

  // Delete history round
  const deleteHistoryRound = async (index: number) => {
    Alert.alert(
      'Delete Game History',
      'Are you sure you want to delete this game history?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const newHistory = [...history];
            newHistory.splice(index, 1);
            setHistory(newHistory);
            await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
          }
        }
      ]
    );
  };

  // Render functions
  const renderPlayerCount = () => (
    <View style={styles.container}>
      <Text style={styles.title}>How many players?</Text>
      <View style={styles.buttonContainer}>
        {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.button, numPlayers === n && styles.selectedButton]}
            onPress={() => handleNumPlayers(n)}
          >
            <Text style={[styles.buttonText, numPlayers === n && styles.selectedButtonText]}>
              {n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderPlayerNames = () => (
    <View style={styles.container}>
      <Text style={styles.title}>Enter player names</Text>
      {playerNames.map((name, idx) => (
        <TextInput
          key={idx}
          style={styles.input}
          placeholder={`Player ${idx + 1}`}
          value={name}
          onChangeText={(text) => handlePlayerName(idx, text)}
        />
      ))}
      <TouchableOpacity style={styles.button} onPress={handleNamesContinue}>
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );

  const handleNewGame = () => {
    Alert.alert(
      'Start New Game',
      'Are you sure you want to start a new game? All current progress will be lost.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'New Game',
          style: 'destructive',
          onPress: () => {
            // Reset all game state
            setStep(1);
            setNumPlayers(2);
            setPlayerNames(Array(2).fill(''));
            setChips(Array(2).fill(0));
            setRowie(Array(2).fill(0));
            setRowieSettings({
              startHand: 0,
              numHands: 0,
              potAmount: 5,
              currentHand: 0,
              isComplete: false
            });
            setHands([]);
            setCurrentHandIndex(-1);
            setCompletedRowies([]);
            setHandResults(Array(2).fill(0));
            setShowSummary(false);
            setMercyApplied(false);
            // Clear only the current game from storage, preserving game history
            AsyncStorage.removeItem(STORAGE_KEY).catch(error => {
              console.error('Error clearing saved game:', error);
            });
          }
        }
      ]
    );
  };

  const renderBottomMenu = () => (
    <View style={styles.bottomMenu}>
      <TouchableOpacity 
        style={styles.menuButton} 
        onPress={handleNewGame}
      >
        <Text style={styles.menuButtonText}>+ New Game</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.menuButton, history.length === 0 && styles.menuButtonDisabled]} 
        onPress={() => {
          try {
            if (history.length > 0) {
              setStep(5);
              setSelectedHistory(null); // Reset selected history when going to list
            }
          } catch (error) {
            console.error('Error navigating to history:', error);
          }
        }}
        disabled={history.length === 0}
      >
        <Text style={[styles.menuButtonText, history.length === 0 && styles.menuButtonTextDisabled]}>
          History
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderSummary = () => (
    <View style={styles.container}>
      <Text style={styles.title}>Game Summary</Text>
      <View style={styles.summarySection}>
        <Text style={styles.summaryTitle}>Pre-Mercy Totals</Text>
        <View style={styles.summaryHeader}>
          <Text style={[styles.summaryHeaderText, { flex: 2 }]}>Player</Text>
          <Text style={[styles.summaryHeaderText, { flex: 1.5 }]}>Poker</Text>
          <Text style={[styles.summaryHeaderText, { flex: 1.5 }]}>Bubble</Text>
        </View>
        {playerNames.map((name, idx) => {
          // Use pre-mercy chip amounts
          const chipTotal = preMercyChips[idx];
          const bubblePayout = calculateBubblePayouts(preMercyChips)[idx] || 0;
          return (
            <View key={idx} style={styles.summaryRow}>
              <Text style={[styles.text, { flex: 2 }]}>{name}</Text>
              <Text style={[styles.summaryAmount, { flex: 1.5 }, chipTotal < 0 ? styles.negativeText : styles.positiveText]}>
                ${chipTotal}
              </Text>
              <Text style={[styles.summaryAmount, { flex: 1.5 }, bubblePayout < 0 ? styles.negativeText : styles.positiveText]}>
                ${bubblePayout}
              </Text>
            </View>
          );
        })}
      </View>

      {!mercyApplied ? (
        <TouchableOpacity 
          style={[styles.button, styles.mercyButton]} 
          onPress={handleMercyCalculation}
        >
          <Text style={styles.buttonText}>Calculate Mercy</Text>
        </TouchableOpacity>
      ) : (
        <>
          <View style={styles.summarySection}>
            <Text style={styles.summaryTitle}>Final Payouts (with Mercy)</Text>
            <View style={styles.summaryHeader}>
              <Text style={[styles.summaryHeaderText, { flex: 2 }]}>Player</Text>
              <Text style={[styles.summaryHeaderText, { flex: 1.5 }]}>Poker</Text>
              <Text style={[styles.summaryHeaderText, { flex: 1.5 }]}>Bubble</Text>
              <Text style={[styles.summaryHeaderText, { flex: 1.5 }]}>Total</Text>
            </View>
            {playerNames.map((name, idx) => {
              const chipTotal = chips[idx] || 0;
              const bubblePayout = calculateBubblePayouts(chips)[idx] || 0;
              const combinedTotal = chipTotal + bubblePayout;
              return (
                <View key={idx} style={styles.summaryRow}>
                  <Text style={[styles.text, { flex: 2 }]}>{name}</Text>
                  <Text style={[styles.summaryAmount, { flex: 1.5 }, chipTotal < 0 ? styles.negativeText : styles.positiveText]}>
                    ${chipTotal}
                  </Text>
                  <Text style={[styles.summaryAmount, { flex: 1.5 }, bubblePayout < 0 ? styles.negativeText : styles.positiveText]}>
                    ${bubblePayout}
                  </Text>
                  <Text style={[styles.summaryAmount, { flex: 1.5 }, combinedTotal < 0 ? styles.negativeText : styles.positiveText]}>
                    ${combinedTotal}
                  </Text>
                </View>
              );
            })}
          </View>
          <TouchableOpacity 
            style={[styles.button, styles.finishButton]} 
            onPress={handleSaveAndExit}
          >
            <Text style={styles.buttonText}>Save to History</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={styles.summarySection}>
        <Text style={styles.summaryTitle}>Completed Rowies</Text>
        {completedRowies.map((rowie, idx) => (
          <View key={idx} style={styles.rowieSummaryRow}>
            <Text style={styles.rowieNumber}>
              Rowie {rowie.rowieNumber} (Hands {rowie.startHand}-{rowie.endHand})
            </Text>
            <Text style={styles.rowieValue}>${rowie.value} per player</Text>
            <Text style={styles.rowieWinner}>
              Winner{rowie.winners.length > 1 ? 's' : ''}: {rowie.winners.join(' & ')}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderRowieLeaderboard = () => {
    // Don't show if no Rowie is active or completed
    if (rowieSettings.currentHand <= 0 && !rowieSettings.isComplete) return null;

    // Calculate current Rowie standings
    const rowieResults = hands.slice(rowieSettings.startHand);
    const rowieTotals = Array(numPlayers).fill(0);
    rowieResults.forEach(result => {
      result.playerResults.forEach((amount, playerIdx) => {
        rowieTotals[playerIdx] += amount;
      });
    });

    // Find the maximum points
    const maxPoints = Math.max(...rowieTotals);
    
    // Sort players by their Rowie points
    const sortedPlayers = rowieTotals
      .map((points, idx) => ({ points, idx }))
      .sort((a, b) => b.points - a.points);

    return (
      <View style={styles.rowieInfo}>
        <Text style={styles.rowieTitle}>
          {rowieSettings.isComplete ? 'Rowie Complete' : 'Active Rowie'}
        </Text>
        <Text style={styles.rowieDetails}>
          {rowieSettings.numHands} hands total • ${rowieSettings.potAmount} per player
        </Text>
        {!rowieSettings.isComplete && (
          <Text style={[
            styles.rowieHandsLeft,
            rowieSettings.currentHand === 1 && styles.lastHandText
          ]}>
            {rowieSettings.currentHand === 1 ? 'Last Hand!' : `${rowieSettings.currentHand} hands remaining`}
          </Text>
        )}
        <View style={styles.rowieLeaderboard}>
          <Text style={styles.leaderboardTitle}>Final Standings</Text>
          {sortedPlayers.map(({ points, idx }, rank) => (
            <View key={idx} style={styles.leaderboardRow}>
              <Text style={styles.leaderboardRank}>
                {'#' + (rank + 1)}
              </Text>
              <Text style={styles.leaderboardName}>
                {playerNames[idx]}
                {points === maxPoints && ' (Winner)'}
              </Text>
              <Text style={[styles.leaderboardPoints, points < 0 && styles.negativeText]}>
                ${points}
              </Text>
              {points < maxPoints && (
                <Text style={styles.leaderboardBehind}>
                  (${maxPoints - points} behind)
                </Text>
              )}
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderRowieHistory = () => {
    if (completedRowies.length === 0) return null;

    return (
      <View style={styles.rowieHistory}>
        <Text style={styles.rowieHistoryTitle}>Completed Rowies</Text>
        {completedRowies.map((rowie, idx) => (
          <View key={idx} style={styles.rowieHistoryRow}>
            <Text style={styles.rowieHistoryNumber}>
              Rowie {rowie.rowieNumber} (Hands {rowie.startHand}-{rowie.endHand})
            </Text>
            <Text style={styles.rowieHistoryValue}>${rowie.value} per player</Text>
            <Text style={styles.rowieHistoryWinner}>
              Winner{rowie.winners.length > 1 ? 's' : ''}: {rowie.winners.join(' & ')}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderGamePlay = () => (
    <View style={styles.container}>
      {showSummary ? (
        renderSummary()
      ) : (
        <>
          {step === 4 ? (
            renderRowieSettings()
          ) : (
            <>
              {playerNames.map((name, idx) => {
                // Calculate running total up to the current hand being viewed
                let runningTotal = 0;
                if (currentHandIndex >= 0) {
                  for (let i = 0; i <= currentHandIndex; i++) {
                    runningTotal += hands[i].playerResults[idx];
                  }
                }
                
                return (
                  <View key={idx} style={styles.playerRow}>
                    <Text style={styles.playerName}>{name}</Text>
                    <View style={styles.inputGroup}>
                      <TouchableOpacity 
                        style={[styles.minusButton, handResults[idx] < 0 && styles.minusButtonActive]} 
                        onPress={() => toggleNegative(idx)}
                      >
                        <Text style={[styles.minusButtonText, handResults[idx] < 0 && styles.minusButtonTextActive]}>-</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={[styles.chipInput, handResults[idx] < 0 && styles.negativeInput]}
                        placeholder=""
                        value={explicitlyEntered[idx] ? handResults[idx].toString() : ''}
                        onChangeText={(text) => handleHandResult(idx, text)}
                        keyboardType="numeric"
                      />
                      <Text style={[
                        styles.totalText, 
                        runningTotal < 0 ? styles.negativeText : styles.positiveText
                      ]}>
                        Total: ${runningTotal}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <View style={styles.submitButtonContainer}>
                <TouchableOpacity 
                  style={[styles.button, styles.submitButton]} 
                  onPress={handleSubmitHand}
                >
                  <Text style={styles.buttonText}>Submit Hand</Text>
                </TouchableOpacity>
              </View>
              {hands.length > 0 && (
                <View style={styles.handNavigation}>
                  <TouchableOpacity 
                    style={[styles.button, styles.navButton]} 
                    onPress={handlePreviousHand}
                    disabled={currentHandIndex <= 0}
                  >
                    <Text style={styles.buttonText}>Previous Hand</Text>
                  </TouchableOpacity>
                  <View style={styles.handInfo}>
                    <Text style={styles.handNumber}>
                      Hand {currentHandIndex + 1} of {hands.length}
                    </Text>
                    {currentHandIndex < hands.length - 1 && (
                      <TouchableOpacity 
                        style={[styles.button, styles.currentHandButton]} 
                        onPress={handleCurrentHand}
                      >
                        <Text style={styles.buttonText}>Current Hand</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity 
                    style={[styles.button, styles.navButton]} 
                    onPress={handleNextHand}
                    disabled={currentHandIndex >= hands.length - 1}
                  >
                    <Text style={styles.buttonText}>Next Hand</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.newRowieButtonContainer}>
                <TouchableOpacity 
                  style={[styles.button, styles.secondaryButton]} 
                  onPress={handleNewRowie}
                >
                  <Text style={styles.buttonText}>New Rowie</Text>
                </TouchableOpacity>
              </View>
              {renderRowieLeaderboard()}
              {renderRowieHistory()}
              <View style={styles.buttonRow}>
                <TouchableOpacity 
                  style={[styles.button, styles.finishButton]} 
                  onPress={handleFinish}
                >
                  <Text style={styles.buttonText}>End Game</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </>
      )}
    </View>
  );

  const renderRowieSettings = () => (
    <View style={styles.rowieSettings}>
      <Text style={styles.rowieSettingsTitle}>New Rowie Settings</Text>
      <View style={styles.rowieInputRow}>
        <View style={styles.rowieInputGroup}>
          <Text style={styles.rowieInputLabel}>Number of Hands</Text>
          <TextInput
            style={styles.rowieInput}
            placeholder="Hands"
            value={rowieSettings.numHands.toString()}
            onChangeText={(text) => handleRowieSettings('numHands', parseInt(text) || 0)}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.rowieInputGroup}>
          <Text style={styles.rowieInputLabel}>Rowie Value</Text>
          <View style={styles.rowieValueInputContainer}>
            <Text style={styles.rowieValuePrefix}>$</Text>
            <TextInput
              style={[styles.rowieInput, styles.rowieValueInput]}
              placeholder="0"
              value={rowieSettings.potAmount.toString()}
              onChangeText={(text) => handleRowieSettings('potAmount', parseInt(text) || 0)}
              keyboardType="numeric"
            />
          </View>
        </View>
      </View>
      <TouchableOpacity 
        style={[styles.button, styles.secondaryButton]} 
        onPress={handleRowieSettingsContinue}
      >
        <Text style={styles.buttonText}>Start Rowie</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHistoryList = () => (
    <View style={styles.historyList}>
      <Text style={styles.historyTitle}>History</Text>
      {history.map((round, idx) => (
        <TouchableOpacity
          key={idx}
          style={styles.historyItem}
          onPress={() => {
            try {
              loadHistoryRound(round);
            } catch (error) {
              console.error('Error loading history round:', error);
              Alert.alert('Error', 'Unable to load game history. Please try again.');
            }
          }}
        >
          <Text style={styles.historyDate}>{round.date}</Text>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => deleteHistoryRound(idx)}
          >
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
      {playerNames.some(name => name.trim() !== '') && (
        <TouchableOpacity 
          style={[styles.button, styles.returnButton]} 
          onPress={handleReturnToGame}
        >
          <Text style={styles.buttonText}>Return to Current Game</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderHistoryView = () => (
    <View style={styles.container}>
      <Text style={styles.title}>Game Summary</Text>
      <Text style={styles.historyDate}>{selectedHistory?.date}</Text>

      <View style={styles.summarySection}>
        <View style={styles.summaryHeader}>
          <Text style={[styles.summaryHeaderText, { flex: 2 }]}>Player</Text>
          <Text style={[styles.summaryHeaderText, { flex: 1.5 }]}>Poker</Text>
          <Text style={[styles.summaryHeaderText, { flex: 1.5 }]}>Bubble</Text>
          <Text style={[styles.summaryHeaderText, { flex: 1.5 }]}>Total</Text>
        </View>
        {selectedHistory?.playerNames?.map((name, idx) => {
          const chipTotal = selectedHistory?.finalChips?.[idx] || 0;
          const bubbleTotal = selectedHistory?.bubblePayouts?.[idx] || 0;
          const combinedTotal = chipTotal + bubbleTotal;
          return (
            <View key={idx} style={styles.summaryRow}>
              <Text style={[styles.text, { flex: 2 }]}>{name}</Text>
              <Text style={[styles.summaryAmount, { flex: 1.5 }, chipTotal < 0 ? styles.negativeText : styles.positiveText]}>
                ${chipTotal}
              </Text>
              <Text style={[styles.summaryAmount, { flex: 1.5 }, bubbleTotal < 0 ? styles.negativeText : styles.positiveText]}>
                ${bubbleTotal}
              </Text>
              <Text style={[styles.summaryAmount, { flex: 1.5 }, combinedTotal < 0 ? styles.negativeText : styles.positiveText]}>
                ${combinedTotal}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.summarySection}>
        <Text style={styles.summaryTitle}>Completed Rowies</Text>
        {selectedHistory?.completedRowies?.map((rowie, idx) => (
          <View key={idx} style={styles.rowieSummaryRow}>
            <Text style={styles.rowieNumber}>
              Rowie {rowie.rowieNumber} (Hands {rowie.startHand}-{rowie.endHand})
            </Text>
            <Text style={styles.rowieValue}>${rowie.value} per player</Text>
            <Text style={styles.rowieWinner}>
              Winner{rowie.winners.length > 1 ? 's' : ''}: {rowie.winners.join(' & ')}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={exitHistoryView}>
          <Text style={styles.buttonText}>Back to History</Text>
        </TouchableOpacity>
        {playerNames.some(name => name.trim() !== '') && (
          <TouchableOpacity 
            style={[styles.button, styles.returnButton]} 
            onPress={handleReturnToGame}
          >
            <Text style={styles.buttonText}>Return to Current Game</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const handleSaveAndExit = async () => {
    await saveToHistory();
    setShowSummary(false);
    setMercyApplied(false);
    setStep(1);
    setNumPlayers(2);
    setPlayerNames(Array(2).fill(''));
    setChips(Array(2).fill(0));
    setRowie(Array(2).fill(0));
    setRowieSettings({
      startHand: 0,
      numHands: 0,
      potAmount: 5,
      currentHand: 0,
      isComplete: false
    });
    setHands([]);
    setCurrentHandIndex(-1);
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  const handleReturnToGame = () => {
    try {
      // Reset any history-related state
      setSelectedHistory(null);
      // Return to game play
      setStep(3);
      // Reset hand results to empty
      setHandResults(Array(numPlayers).fill(0));
    } catch (error) {
      console.error('Error returning to game:', error);
      Alert.alert('Error', 'Unable to return to game. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView style={styles.scrollView}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Poker Game</Text>
          </View>

          {step === 1 && renderPlayerCount()}
          {step === 2 && renderPlayerNames()}
          {step === 3 && renderGamePlay()}
          {step === 4 && renderGamePlay()}
          {step === 5 && renderHistoryView()}
          {step === 1 && history.length > 0 && renderHistoryList()}
        </ScrollView>
        {renderBottomMenu()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 16,
    backgroundColor: '#1976D2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 10,
  },
  button: {
    backgroundColor: '#1976D2',
    padding: 12,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
    margin: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  secondaryButton: {
    backgroundColor: '#2E7D32',
  },
  mercyButton: {
    backgroundColor: '#F57C00',
  },
  finishButton: {
    backgroundColor: '#C62828',
  },
  navButton: {
    backgroundColor: '#6A1B9A',
  },
  selectedButton: {
    backgroundColor: '#1565C0',
  },
  buttonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  selectedButtonText: {
    color: 'white',
  },
  input: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  playerRow: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  playerName: {
    flex: 1.5,
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
    marginRight: 8,
  },
  inputGroup: {
    flex: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  minusButton: {
    width: 32,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    marginRight: 8,
    backgroundColor: 'white',
  },
  minusButtonActive: {
    backgroundColor: '#C62828',
    borderColor: '#C62828',
  },
  minusButtonText: {
    fontSize: 20,
    color: '#666',
  },
  minusButtonTextActive: {
    color: 'white',
  },
  chipInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    fontSize: 16,
    backgroundColor: 'white',
    minWidth: 100,
  },
  negativeInput: {
    borderColor: '#C62828',
    color: '#C62828',
  },
  totalText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2c3e50',
    marginLeft: 8,
    minWidth: 80,
  },
  negativeText: {
    color: '#C62828',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  handNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  handNumber: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
  },
  rowieInfo: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 8,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#2196F3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  rowieTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1565C0',
    textAlign: 'center',
    marginBottom: 6,
  },
  rowieDetails: {
    fontSize: 16,
    color: '#1976D2',
    textAlign: 'center',
    marginBottom: 6,
  },
  rowieHandsLeft: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1565C0',
    textAlign: 'center',
  },
  rowieLeaderboard: {
    marginTop: 12,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2196F3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  leaderboardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1565C0',
    marginBottom: 8,
    textAlign: 'center',
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  leaderboardRank: {
    width: 32,
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  leaderboardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#2c3e50',
  },
  leaderboardPoints: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1976D2',
    marginRight: 8,
  },
  leaderboardBehind: {
    fontSize: 13,
    color: '#666',
  },
  summarySection: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1565C0',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  summaryName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
  },
  summaryAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
  },
  rowieSummaryRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowieNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  rowieValue: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  rowieWinner: {
    fontSize: 14,
    color: '#4CAF50',
    marginTop: 2,
  },
  rowieHistory: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 8,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  rowieHistoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 12,
    textAlign: 'center',
  },
  rowieHistoryRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  rowieHistoryNumber: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2c3e50',
  },
  rowieHistoryValue: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  rowieHistoryWinner: {
    fontSize: 14,
    color: '#2E7D32',
    marginTop: 4,
  },
  previousHandResults: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 8,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#2196F3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  previousHandTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1565C0',
    marginBottom: 10,
    textAlign: 'center',
  },
  previousHandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  previousHandName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2c3e50',
  },
  previousHandAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1976D2',
  },
  gameTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  rowieValueInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    backgroundColor: 'white',
  },
  rowieValuePrefix: {
    fontSize: 16,
    color: '#666',
    paddingLeft: 10,
  },
  rowieValueInput: {
    borderWidth: 0,
    flex: 1,
  },
  menuButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  menuButtonTextDisabled: {
    color: '#9e9e9e',
  },
  rowieSettings: {
    backgroundColor: '#E3F2FD',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  rowieSettingsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976D2',
    textAlign: 'center',
    marginBottom: 15,
  },
  rowieInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  rowieInputGroup: {
    flex: 1,
    marginHorizontal: 5,
  },
  rowieInputLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  rowieInput: {
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  bottomMenu: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  menuButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#1976D2',
    minWidth: 120,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  menuButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  historyView: {
    padding: 20,
  },
  historyDate: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
  },
  historySubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  historyName: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  historyDetails: {
    flex: 2,
    alignItems: 'flex-end',
  },
  historyChips: {
    fontSize: 16,
    color: '#2196F3',
    fontWeight: '500',
  },
  historyRowie: {
    fontSize: 14,
    color: '#4CAF50',
    marginTop: 4,
  },
  historyBubble: {
    fontSize: 14,
    color: '#FF9800',
    marginTop: 4,
  },
  historyList: {
    padding: 20,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  deleteButton: {
    backgroundColor: '#ff4444',
    padding: 8,
    borderRadius: 4,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  handInfo: {
    alignItems: 'center',
  },
  currentHandButton: {
    backgroundColor: '#4CAF50',
    marginTop: 5,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 15,
  },
  lastHandText: {
    color: '#F57C00',
    fontWeight: '700',
  },
  returnButton: {
    backgroundColor: '#4CAF50',
  },
  summaryHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#1976D2',
    marginBottom: 8,
  },
  summaryHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
    textAlign: 'center',
  },
  submitButtonContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  submitButton: {
    minWidth: 200,
    paddingVertical: 15,
    paddingHorizontal: 30,
  },
  newRowieButtonContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  text: {
    color: '#000000',
  },
  positiveText: {
    color: '#2E7D32',
  },
}); 