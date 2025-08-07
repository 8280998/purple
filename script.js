const tokenAddress = '0xd642b49d10cc6e1bc1c6945725667c35e0875f22';
const contractAddress = '0x8EfED44e1Ed675C7aE460D2a71DAAf34F382a3BD';
const rpcUrl = 'https://rpc-gel.inkonchain.com';
const chainId = 57073;
const decimals = 18;

const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
let signer, tokenContract, betContract;
let selectedGuess = '';
let selectedAmount = 0;
let selectedButton = null;

const erc20Abi = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)'
];

const betAbi = [
    'event BetPlaced(uint256 indexed betId, address indexed user, bytes1 guess, uint256 amount, uint256 blockNumber)',
    'event BetResolved(uint256 indexed betId, address indexed user, bytes1 targetByte, bool won, uint256 reward)',
    'function placeBet(bytes1 guess, uint256 amount) external returns (uint256)',
    'function resolveBet(uint256 betId) external',
    'function getBet(uint256 betId) external view returns (address user, bytes1 guess, uint256 amount, bytes1 targetByte, bool won, uint256 reward, uint256 blockNumber, bool resolved)',
    'function getContractBalance() external view returns (uint256)'
];

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    init();

    document.getElementById('bet100').onclick = () => setAmount(100);
    document.getElementById('bet500').onclick = () => setAmount(500);
    document.getElementById('bet1000').onclick = () => setAmount(1000);
});

async function init() {
    console.log('Init started');
    const guesses = '0123456789abcdef'.split('');
    const guessButtons = document.getElementById('guessButtons');
    if (!guessButtons) {
        console.error('guessButtons element not found');
        return;
    }
    guesses.forEach(g => {
        const btn = document.createElement('button');
        btn.textContent = g;
        btn.onclick = () => {
            if (selectedButton) selectedButton.classList.remove('selected');
            selectedGuess = g;
            selectedButton = btn;
            btn.classList.add('selected');
            updateBetButton();
            console.log('Guess selected:', g);
        };
        guessButtons.appendChild(btn);
    });
    console.log('Guess buttons created:', guesses.length);

    loadLogs();
    updateContractBalance().catch(err => console.error('Balance update error:', err));
}

async function updateContractBalance() {
    try {
        console.log('Updating balance with contract:', contractAddress);
        const tempToken = new ethers.Contract(tokenAddress, erc20Abi, provider);
        const balance = await tempToken.balanceOf(contractAddress);
        const formattedBalance = ethers.utils.formatUnits(balance, decimals);
        document.getElementById('contractBalance').textContent = `Purple pool: ${formattedBalance}`;
        console.log('Balance updated:', formattedBalance);
    } catch (err) {
        console.error('Error updating balance:', err.message);
        document.getElementById('contractBalance').textContent = 'Purple pool: error';
    }
}

function setAmount(amount) {
    console.log('Set amount called:', amount);
    selectedAmount = amount;
    document.getElementById('amountInput').value = '';
    updateBetButton();
}

document.getElementById('amountInput').addEventListener('input', (e) => {
    let val = parseInt(e.target.value);
    if (val < 1) {
        val = 1;
        e.target.value = 1;
    }
    if (val > 10000) {
        alert('Maximum bet is 10,000 tokens');
        val = 10000;
        e.target.value = 10000;
    }
    selectedAmount = val || 0;
    updateBetButton();
});

async function updateBetButton() {
    const btn = document.getElementById('placeBet');
    btn.disabled = !signer || !selectedGuess || selectedAmount <= 0;

    if (selectedAmount > 0) {
        try {
            const tempToken = new ethers.Contract(tokenAddress, erc20Abi, provider);
            const balance = await tempToken.balanceOf(contractAddress);
            const required = ethers.BigNumber.from(selectedAmount).mul(12);
            if (balance.lt(required)) {
                btn.disabled = true;
                alert('合约余额不足以支付潜在奖励 (需 > 12x 下注额)');
            }
        } catch (err) {
            console.error('Error in updateBetButton:', err);
        }
    }
}

document.getElementById('connectWallet').onclick = async () => {
    console.log('Connect button clicked');
    let walletProvider;
    if (window.ethereum) {
        walletProvider = window.ethereum;
        console.log('Ethereum provider detected (MetaMask/Coinbase)');
    } else if (window.okxwallet) {
        walletProvider = window.okxwallet;
        console.log('OKX detected');
    } else {
        alert('No supported wallet detected. Install MetaMask, OKX, or Coinbase Wallet extension.');
        console.log('No wallet detected');
        return;
    }

    try {
        await walletProvider.request({ method: 'eth_requestAccounts' });
        const ethersProvider = new ethers.providers.Web3Provider(walletProvider);
        signer = ethersProvider.getSigner();
        const address = await signer.getAddress();
        document.getElementById('walletStatus').textContent = `Connected: ${address.slice(0,6)}...${address.slice(-4)}`;
        console.log('Wallet connected:', address);

        const currentChain = await ethersProvider.getNetwork();
        if (parseInt(currentChain.chainId) !== chainId) {
            try {
                await walletProvider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: `0x${chainId.toString(16)}` }],
                });
                console.log('Switched to INK chain');
            } catch (switchError) {
                console.error('Switch error:', switchError.message);
                if (switchError.code === 4902 || switchError.code === -32603) {
                    try {
                        await walletProvider.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: `0x${chainId.toString(16)}`,
                                chainName: 'Ink',
                                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                                rpcUrls: [rpcUrl],
                                blockExplorerUrls: ['https://explorer.inkonchain.com']
                            }],
                        });
                        console.log('Added INK chain');
                        await walletProvider.request({
                            method: 'wallet_switchEthereumChain',
                            params: [{ chainId: `0x${chainId.toString(16)}` }],
                        });
                    } catch (addError) {
                        console.error('Add chain error:', addError.message);
                        alert('添加 INK 链失败，请手动在钱包添加网络');
                    }
                } else if (switchError.code === 4001) {
                    alert('用户取消了链切换');
                } else {
                    alert('链切换失败，请检查钱包设置');
                }
            }
        } else {
            console.log('Already on INK chain');
        }

        tokenContract = new ethers.Contract(tokenAddress, erc20Abi, signer);
        betContract = new ethers.Contract(contractAddress, betAbi, signer);

        updateBetButton();
        updateContractBalance();
    } catch (err) {
        console.error('Connection error:', err.message);
        if (err.code === 4001) {
            alert('用户取消了连接请求');
        } else {
            alert('连接失败，请检查钱包和网络设置');
        }
    }
};

document.getElementById('placeBet').onclick = async () => {
    if (!selectedGuess || selectedAmount <= 0) return;

    try {
        const allowance = await tokenContract.allowance(await signer.getAddress(), contractAddress);
        if (allowance.lt(ethers.BigNumber.from(selectedAmount))) {
            const approveTx = await tokenContract.approve(contractAddress, ethers.BigNumber.from(selectedAmount));
            await approveTx.wait();
        }

        const guessByte = ethers.utils.toUtf8Bytes(selectedGuess)[0];
        const tx = await betContract.placeBet(guessByte, ethers.BigNumber.from(selectedAmount));
        const receipt = await tx.wait();

        updateContractBalance();

        addLog(receipt.blockNumber, selectedGuess, selectedAmount);
    } catch (err) {
        console.error('Place bet error:', err.message);
    }
};

async function addLog(blockNum, guess, amount) {
    const logs = getLogs();
    logs.push({ blockNum, guess, amount, status: 'Pending', tail: '' });
    saveLogs(logs);
    renderLogs();

    const interval = setInterval(async () => {
        try {
            const block = await provider.getBlock(blockNum);
            if (block && block.hash) {
                clearInterval(interval);
                const tx = await betContract.claim(blockNum);
                await tx.wait();
                const tail = getLastHexChar(block.hash);
                updateLogStatus(blockNum, 'Claimed (Check wallet for reward)', tail);
            }
        } catch (err) {
            console.error('Add log error:', err.message);
        }
    }, 2000);
}

function getLastHexChar(hash) {
    const lastByte = hash.slice(-2); // Last byte as hex string
    const lastNibble = parseInt(lastByte, 16) & 0x0F;
    if (lastNibble < 10) {
        return lastNibble.toString();
    } else {
        return String.fromCharCode(97 + (lastNibble - 10)); // a-f
    }
}

function updateLogStatus(blockNum, status, tail) {
    const logs = getLogs();
    const log = logs.find(l => l.blockNum === blockNum);
    if (log) {
        log.status = status;
        log.tail = tail;
        if (status.includes('Win')) log.highlight = true;
    }
    saveLogs(logs);
    renderLogs();
}

function getLogs() {
    return JSON.parse(localStorage.getItem('betLogs') || '[]');
}

function saveLogs(logs) {
    localStorage.setItem('betLogs', JSON.stringify(logs));
}

function renderLogs() {
    const list = document.getElementById('logList');
    list.innerHTML = '';
    getLogs().forEach(log => {
        const li = document.createElement('li');
        li.textContent = `Block: ${log.blockNum}, Tail: ${log.tail || 'Pending'}, Guess: ${log.guess}, Amount: ${log.amount}, Status: ${log.status}`;
        if (log.highlight) li.classList.add('win');
        list.appendChild(li);
    });
}

function loadLogs() {
    renderLogs();
}
