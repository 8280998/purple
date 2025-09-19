import React, { useState, useEffect, useRef } from 'react';
import Modal from 'react-modal';
import { ethers } from 'ethers';
import './App.css'; // Import the CSS for styling

// Set app element for modal accessibility
Modal.setAppElement('#root');

const CONTRACT_ABI = [
  {
    "inputs": [
      {"internalType": "string", "name": "guess", "type": "string"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "placeBet",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "betId", "type": "uint256"}],
    "name": "resolveBet",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "betId", "type": "uint256"}],
    "name": "getBet",
    "outputs": [
      {
        "components": [
          {"internalType": "address", "name": "user", "type": "address"},
          {"internalType": "string", "name": "guess", "type": "string"},
          {"internalType": "uint256", "name": "amount", "type": "uint256"},
          {"internalType": "bytes1", "name": "targetByte", "type": "bytes1"},
          {"internalType": "bool", "name": "won", "type": "bool"},
          {"internalType": "uint256", "name": "reward", "type": "uint256"},
          {"internalType": "uint256", "name": "blockNumber", "type": "uint256"},
          {"internalType": "bool", "name": "resolved", "type": "bool"}
        ],
        "internalType": "struct GuessCounterGame.Bet",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "betCounter",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "uint256", "name": "betId", "type": "uint256"},
      {"indexed": true, "internalType": "address", "name": "user", "type": "address"},
      {"indexed": false, "internalType": "string", "name": "guess", "type": "string"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "blockNumber", "type": "uint256"}
    ],
    "name": "BetPlaced",
    "type": "event"
  }
];

const ERC20_ABI = [
  {
    "constant": false,
    "inputs": [
      {"name": "_spender", "type": "address"},
      {"name": "_value", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {"name": "_owner", "type": "address"},
      {"name": "_spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  }
];

// Hardcoded values
const RPC_URL = "https://rpc-qnd.inkonchain.com";
const CHAIN_ID = 57073;
const CONTRACT_ADDRESS = "0xB500c062dE1445B9E2A08B71968DD9AC34eA6477";
const TOKEN_ADDRESS = "0xD642B49d10cc6e1BC1c6945725667c35e0875f22";
const EXPLORER_URL = "https://explorer.inkonchain.com/";
const COOLDOWN = 1; // seconds
const BLOCK_WAIT_TIME = 2; // seconds
const INK_CHAIN_ID_HEX = "0xDEF1"; // 57073 in hex


const App = () => {
  const [betAmount, setBetAmount] = useState(100.0);
  const [numBets, setNumBets] = useState(1);
  const [mode, setMode] = useState("1"); // 1: manual, 2: random
  const [guess, setGuess] = useState("0");
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState(0);
  const [contractBalance, setContractBalance] = useState(0);
  const [logs, setLogs] = useState([]);
  const [isBetting, setIsBetting] = useState(false);
  const stopRequestedRef = useRef(false);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [visitorCount, setVisitorCount] = useState('?');

  useEffect(() => {
    fetch('https://visitor.6developer.com/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'purplebet.vercel.app',
      })
    })
      .then(res => res.json())
      .then(data => setVisitorCount(data.totalCount || '?'))
      .catch(() => setVisitorCount('?'));
  }, []);

  useEffect(() => {
    if (account && provider) {
      updateBalance();
      updateContractBalance();
    }
  }, [account, provider]);

  useEffect(() => {
    if (!provider) return;

    const handleChainChanged = async (chainId) => {
      const newChainId = parseInt(chainId, 16); // Hex to decimal
      if (newChainId === CHAIN_ID) {
        addLog({type: 'simple', message: "Network switched to INK."});
        if (account) {
          updateBalance();
          updateContractBalance();
        }
      } else {
        addLog({type: 'simple', message: "Switched to a different network. Please switch back to INK."});
      }
    };

    const handleAccountsChanged = (accounts) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        updateBalance();
        updateContractBalance();
      } else {
        setAccount(null);
        setSigner(null);
        setProvider(null);
        setBalance(0);
        setContractBalance(0);
        addLog({type: 'simple', message: "Wallet disconnected."});
      }
    };

    provider.provider.on('chainChanged', handleChainChanged);
    provider.provider.on('accountsChanged', handleAccountsChanged);

    return () => {
      provider.provider.removeListener('chainChanged', handleChainChanged);
      provider.provider.removeListener('accountsChanged', handleAccountsChanged);
    };
  }, [provider, account]);

  const addLog = (logEntry) => {
    setLogs(prev => [...prev, logEntry]);
  };

  const connectWithWallet = async (walletType) => {
    let ethereumProvider;
    let walletName = walletType.charAt(0).toUpperCase() + walletType.slice(1);

    if (walletType === 'metamask') {
      if (!window.ethereum || !window.ethereum.isMetaMask) {
        addLog({type: 'simple', message: "MetaMask not detected. Please install or enable it. If multiple wallets are installed, try disabling others temporarily."});
        return;
      }
      ethereumProvider = window.ethereum;
    } else if (walletType === 'okx') {
      if (!window.okxwallet) {
        addLog({type: 'simple', message: "OKX Wallet not detected. Please install or enable it."});
        return;
      }
      ethereumProvider = window.okxwallet;
    } else if (walletType === 'coinbase') {
      if (!window.coinbaseWalletExtension) {
        addLog({type: 'simple', message: "Coinbase Wallet not detected. Please install or enable it."});
        return;
      }
      ethereumProvider = window.coinbaseWalletExtension;
    } else {
      addLog({type: 'simple', message: "Unsupported wallet type."});
      return;
    }

    try {
      const accounts = await ethereumProvider.request({ method: 'eth_requestAccounts' });

      const newProvider = new ethers.BrowserProvider(ethereumProvider);
      const network = await newProvider.getNetwork();

      if (Number(network.chainId) !== CHAIN_ID) {
        addLog({type: 'simple', message: `Detected wallet: ${walletName}. Switching to INK...`});
        let switchSuccess = false;
        try {
          await ethereumProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: INK_CHAIN_ID_HEX }],
          });
          switchSuccess = true;
        } catch (switchError) {
          if (switchError.code === 4902) {
            try {
              await ethereumProvider.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: INK_CHAIN_ID_HEX,
                  chainName: 'INK',
                  rpcUrls: [RPC_URL],
                  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                  blockExplorerUrls: ['https://explorer.inkonchain.com/'],
                }],
              });
              addLog({type: 'simple', message: `Chain added to ${walletName}. Now switching...`});
              // After adding, try switching again
              await ethereumProvider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: INK_CHAIN_ID_HEX }],
              });
              switchSuccess = true;
            } catch (addError) {
              addLog({type: 'simple', message: `Failed to add chain to ${walletName}: ${addError.message}`});
            }
          } else {
            addLog({type: 'simple', message: `Switch failed for ${walletName}: ${switchError.message}`});
          }
        }

        if (switchSuccess) {
          // Add a longer delay to allow the wallet to fully update after switch
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const updatedNetwork = await newProvider.getNetwork();
        if (Number(updatedNetwork.chainId) !== CHAIN_ID) {
          addLog({type: 'simple', message: `Failed to switch to Base in ${walletName}. Please switch manually.`});
          addLog({type: 'simple', message: "Network details: Chain ID: 57073, RPC: https://rpc-qnd.inkonchain.com, Symbol: ETH, Explorer: https://explorer.inkonchain.com"});
          // Proceed with connection but warn
          addLog({type: 'simple', message: "Connected anyway. Please switch network manually in wallet to use the app fully."});
        } else {
          addLog({type: 'simple', message: "Successfully switched to INK!"});
        }
      }

      const newSigner = await newProvider.getSigner();
      setProvider(newProvider);
      setSigner(newSigner);
      setAccount(accounts[0]);
      addLog({type: 'simple', message: `Connected with ${walletName}: ${accounts[0]}`});

      // Force balance update after state settles
      setTimeout(() => {
        if (provider && account) {
          updateBalance();
          updateContractBalance();
        }
      }, 1000);
    } catch (error) {
      addLog({type: 'simple', message: `Connection failed: ${error.message}`});
    }
  };

  const updateBalance = async () => {
    try {
      const tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
      const bal = await tokenContract.balanceOf(account);
      setBalance(ethers.formatEther(bal));
    } catch (error) {
      addLog({type: 'simple', message: `Failed to fetch balance: ${error.message}`});
    }
  };

  const updateContractBalance = async () => {
    try {
      const tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
      const bal = await tokenContract.balanceOf(CONTRACT_ADDRESS);
      setContractBalance(ethers.formatEther(bal));
    } catch (error) {
      addLog({type: 'simple', message: `Failed to fetch contract balance: ${error.message}`});
    }
  };

  const approveToken = async (contractAddr, tokenContract) => {
    try {
      const allowance = await tokenContract.allowance(account, contractAddr);
      const required = ethers.parseEther(betAmount.toString()) * BigInt(numBets);
      if (allowance < required) {

        const estimatedGas = await tokenContract.approve.estimateGas(contractAddr, ethers.MaxUint256);
        const gasLimit = estimatedGas * 120n / 100n;
        const tx = await tokenContract.approve(contractAddr, ethers.MaxUint256, { gasLimit });
        addLog({type: 'tx', message: `Approving tokens... Tx: `, txHash: tx.hash});
        await tx.wait(2);
        addLog({type: 'simple', message: `Approval confirmed.`});
      }
    } catch (error) {
      addLog({type: 'simple', message: `Approval failed: ${error.message}`});
      throw error;
    }
  };

  const betIteration = async (contract, tokenContract, i) => {
    if (stopRequestedRef.current) {
      addLog({type: 'simple', message: 'Betting stopped by user.'});
      return false;
    }

    const currentGuess = mode === '1' ? guess : '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
    addLog({type: 'simple', message: `Attempting bet ${i+1}/${numBets} with guess ${currentGuess}`});
    const { betId } = await placeBet(contract, currentGuess);
    await new Promise(resolve => setTimeout(resolve, BLOCK_WAIT_TIME * 1000));
    await resolveBet(contract, betId);
    await new Promise(resolve => setTimeout(resolve, COOLDOWN * 1000));
    updateBalance();
    updateContractBalance();
    return true;
  };

  const placeBet = async (contract, currentGuess, retryCount = 0) => {
    try {
      const amountWei = ethers.parseEther(betAmount.toString());

      const estimatedGas = await contract.placeBet.estimateGas(currentGuess, amountWei);
      const gasLimit = estimatedGas * 120n / 100n;
      const tx = await contract.placeBet(currentGuess, amountWei, { gasLimit });
      addLog({type: 'tx', message: `Placing bet with guess ${currentGuess}... Tx: `, txHash: tx.hash});
      const receipt = await tx.wait();
      const iface = new ethers.Interface(CONTRACT_ABI);
      let betId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === 'BetPlaced') {
            betId = parsed.args.betId;
            break;
          }
        } catch {}
      }
      if (!betId) throw new Error('Failed to extract betId');
      addLog({type: 'betPlaced', betId: betId.toString(), blockNumber: receipt.blockNumber});
      return { receipt, txHash: tx.hash, betId: betId.toString() };
    } catch (error) {
      if (error.message.includes('Insufficient allowance') && retryCount < 1) {
        addLog({type: 'simple', message: `Allowance sync delay detected, retrying bet...`});
        await new Promise(resolve => setTimeout(resolve, 2000));
        return placeBet(contract, currentGuess, retryCount + 1);
      }
      addLog({type: 'simple', message: `Place bet failed: ${error.message}`});
      throw error;
    }
  };

  const resolveBet = async (contract, betId, retryCount = 0) => {
    try {
      const bet = await contract.getBet(BigInt(betId));
      const betBlock = Number(bet[6]);  // bet blockNumber
      const currentBlock = await provider.getBlockNumber();
      const blocksDiff = currentBlock - betBlock;
      addLog({type: 'simple', message: `Checking blocks: Bet at ${betBlock}, Current ${currentBlock}, Diff: ${blocksDiff}`});

      if (blocksDiff < 2) {
        const waitTime = (2 - blocksDiff) * 2 * 1000;
        addLog({type: 'simple', message: `Waiting extra ${waitTime / 1000}s for 2 blocks confirmation...`});
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const estimatedGas = await contract.resolveBet.estimateGas(BigInt(betId));
      const gasLimit = estimatedGas * 120n / 100n;
      const tx = await contract.resolveBet(BigInt(betId), { gasLimit });
      const receipt = await tx.wait();
      const resolvedBet = await contract.getBet(BigInt(betId));
      const won = resolvedBet[4];
      const reward = ethers.formatEther(resolvedBet[5]);
      const blockNumber = resolvedBet[6].toString();
      const block = await provider.getBlock(Number(blockNumber));
      const targetByte = String.fromCharCode(resolvedBet[3]);
      addLog({type: 'blockInfo', blockNumber, blockHash: block.hash, targetByte});
      if (won) {
        addLog({type: 'result', won: true, reward, txHash: tx.hash, betId});
      } else {
        addLog({type: 'result', won: false, betId});
      }
      return { bet: resolvedBet, txHash: tx.hash };
    } catch (error) {
      if (error.message.includes('Wait for at least 2 blocks') && retryCount < 2) {
        const waitTime = 2000;
        addLog({type: 'simple', message: `Block wait required, retrying in ${waitTime / 1000}s...`});
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return resolveBet(contract, betId, retryCount + 1);
      }
      addLog({type: 'simple', message: `Resolve failed: ${error.message}`});
      throw error;
    }
  };

  const startBetting = async () => {
    if (!signer || !account) {
      addLog({type: 'simple', message: "Connect wallet first."});
      return;
    }
    if (mode === '1' && !'0123456789abcdef'.includes(guess)) {
      addLog({type: 'simple', message: "Invalid guess for manual mode."});
      return;
    }
    setIsBetting(true);
    stopRequestedRef.current = false;
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
      await approveToken(CONTRACT_ADDRESS, tokenContract);

      await new Promise(resolve => setTimeout(resolve, 3000));
      addLog({type: 'simple', message: 'Waiting for allowance sync...'});

      const newAllowance = await tokenContract.allowance(account, CONTRACT_ADDRESS);
      const required = ethers.parseEther(betAmount.toString()) * BigInt(numBets);
      if (newAllowance < required) {
        addLog({type: 'simple', message: `Allowance still low, retrying approve...`});
        await approveToken(CONTRACT_ADDRESS, tokenContract);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      for (let i = 0; i < numBets; i++) {
        if (stopRequestedRef.current) {
          addLog({type: 'simple', message: 'Betting stopped by user.'});
          break;
        }
        await betIteration(contract, tokenContract, i);
      }
    } catch (error) {
      addLog({type: 'simple', message: `Betting process error: ${error.message}`});
    } finally {
      setIsBetting(false);
      stopRequestedRef.current = false;
    }
  };

  const stopBetting = () => {
    stopRequestedRef.current = true;
    addLog({type: 'simple', message: "Stopping betting..."});
  };

  const shortenHash = (hash) => hash ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : '';

  const possibleGuesses = '0123456789abcdef'.split('');

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>INK Betting Game</h1>
        <p className="visitor-count">Welcome, you are the {visitorCount}th visitor</p>
      </header>
      <div className="wallet-buttons">
        <button className="connect-btn" onClick={() => connectWithWallet('metamask')}>
          Connect MetaMask
        </button>
        <button className="connect-btn" onClick={() => connectWithWallet('okx')}>
          Connect OKX
        </button>
        <button className="connect-btn" onClick={() => connectWithWallet('coinbase')}>
          Connect Coinbase
        </button>
      </div>
      {account && (
        <div className="account-info">
          <p>Account: {shortenHash(account)  } Balance: {balance} Purple</p>
        </div>
      )}
      <div className="button-group">
        <button className="instructions-btn" onClick={() => setModalIsOpen(true)}>
          Instructions
        </button>
        <div className="vault-info">
          Vault: {contractBalance} Purple
        </div>
      </div>
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={() => setModalIsOpen(false)}
        className="modal-content"
        overlayClassName="modal-overlay"
      >
        <h2>Game Instructions</h2>
        <p>Guess the character value of the last digit in the block hash of the bet's block, choose from 0-9 or a-f.</p>
        <p>If correct, win 12 times the bet amount as reward; if incorrect, lose the bet amount.</p>
        <p>The transaction hash is not the block hash; a block can contain multiple transaction hashes.</p>
        <p>To ensure fairness, openness, and transparency, only the last digit of the block hash generated at the time of the bet is used.</p>
        <button className="close-btn" onClick={() => setModalIsOpen(false)}>
          Close
        </button>
      </Modal>

      <div className="betting-section">
        <div className="mode-selector">
          <label>Bet Mode:</label>
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="1">Manual</option>
            <option value="2">Random</option>
          </select>
        </div>
        {mode === '1' && (
          <div className="guess-selector">
            <label>Guess:</label>
            <div className="guess-buttons">
              {possibleGuesses.map(g => (
                <button
                  key={g}
                  onClick={() => setGuess(g)}
                  className={`guess-btn ${guess === g ? 'active' : ''}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="input-row">
          <div className="input-group">
            <label>Bet Amount (Purple):</label>
            <input
              type="number"
              value={betAmount}
              onChange={e => setBetAmount(Number(e.target.value))}
              className="input-field"
            />
          </div>
          <div className="input-group">
            <label>Number of Bets:</label>
            <input
              type="number"
              value={numBets}
              onChange={e => setNumBets(Number(e.target.value))}
              className="input-field"
            />
          </div>
        </div>
        <div className="bet-buttons">
          <button onClick={startBetting} disabled={isBetting} className="start-btn">
            Start Betting
          </button>
          <button onClick={stopBetting} disabled={!isBetting} className="stop-btn">
            Stop Betting
          </button>
        </div>
      </div>

      <div className="logs-section">
        <h2>Bet Logs</h2>
        <div className="logs-container">
          {logs.map((log, i) => {
            if (log.type === 'simple') {
              return (
                <p key={i}>
                  {log.message}
                  {log.txHash && (
                    <a href={`${EXPLORER_URL}/tx/${log.txHash}`} target="_blank" rel="noopener noreferrer" className="tx-link">
                      {shortenHash(log.txHash)}
                    </a>
                  )}
                </p>
              );
            } else if (log.type === 'tx') {
              return (
                <p key={i}>
                  {log.message}
                  <a href={`${EXPLORER_URL}/tx/${log.txHash}`} target="_blank" rel="noopener noreferrer" className="tx-link">
                    {shortenHash(log.txHash)}
                  </a>
                </p>
              );
            } else if (log.type === 'betPlaced') {
              return (
                <p key={i}>
                  Bet placed. Bet ID: {log.betId}, Block: 
                  <a href={`${EXPLORER_URL}/block/${log.blockNumber}`} target="_blank" rel="noopener noreferrer" className="tx-link">
                    {log.blockNumber}
                  </a>
                </p>
              );
            } else if (log.type === 'blockInfo') {
              return (
                <p key={i}>
                  Block: 
                  <a href={`${EXPLORER_URL}/block/${log.blockNumber}`} target="_blank" rel="noopener noreferrer" className="tx-link">
                    {log.blockNumber}
                  </a>
                  Hash: 
                  <a href={`${EXPLORER_URL}/block/${log.blockHash}`} target="_blank" rel="noopener noreferrer" className="tx-link">
                    {shortenHash(log.blockHash)}
                  </a>, Target Byte: {log.targetByte}
                </p>
              );
            } else if (log.type === 'result') {
              const className = log.won ? 'win-log' : 'lost-log';
              return (
                <p key={i} className={className}>
                  {log.won ? 'WOW! YOUR WIN!!!' : `Lost bet ${log.betId}.`}
                  {log.won && (
                    <>
                      <br />
                      Send {log.reward} token tx: 
                      <a href={`${EXPLORER_URL}/tx/${log.txHash}`} target="_blank" rel="noopener noreferrer" className="tx-link">
                        {shortenHash(log.txHash)}
                      </a>
                    </>
                  )}
                </p>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};

export default App;
