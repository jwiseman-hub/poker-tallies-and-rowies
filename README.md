# Poker Tallies and Rowies

A React Native mobile app for tracking Texas Hold 'Em poker game without using chips, including:
- Chip counts for each player (set in $ amounts (When the creators play, they set a minimum bet of $100, and a maximum bet of $1000 ("all-in"), which is then reduced at the completion of the game by a mercy calculation of 1.25%, i.e. a $1000 win is really only a $12.50 win after mercy, but players can ignore the mercy calculation step if they prefer and pay the actual amounts lost. They can set betting amounts to whatever level the other players agree to. There is an added bet called a Bubble bet, which is essentially a Rowie (see below) for the full poker game, from the first hand to the last hand, that ranks the winners and losers based on final chip count, and is worth $10 to each player relative to their position to the other players (i.e. the players with fewer chips pay $10 to each player with more chips), and no mercy is calculated on that bet by the app, even if you hit the "Calculate Mercy" button).
- Rowie tracking with support for ties (Rowie's are a game within the Texas Hold'em game that basically is a bet that over the course of a certain number of hands (selected by the players), the player who has won the most chips by the end of that number of hands (all players starting even at the first hand of the Rowie), wins cash from each player below him or her (the amount of cash is selected at the start of each Rowie).
- Game summary with pre and post mercy calculations
- History view of completed games
- Hand navigation and correction support (hand correction is still glitchy, so it's recommended that before you hit "submit hand" you make sure the amounts for each player are correct for that hand's winners and losers).

## Features
- Empty chip input boxes that show '0' when typed
- Proper handling of negative numbers
- Rowie tracking with support for multiple winners
- Game summary showing both pre and post mercy calculations
- History view of completed games
- Easy navigation between hands
- Support for correcting previous hand results

## Technical Details
- Built with React Native
- Uses Expo for development and building
- Supports both iOS and Android platforms
