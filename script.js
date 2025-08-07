const tokenAddress = '0xd642b49d10cc6e1bc1c6945725667c35e0875f22';
const contractAddress = '0x8efed44e1ed675c7ae460d2a71daaf34f382a3bd'; // 
const rpcUrl = 'https://rpc-gel.inkonchain.com';
const chainId = 57073;

const provider = new ethers.JsonRpcProvider(rpcUrl);
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
    'event BetPlaced(address indexed user, uint256 blockNum, bytes1 guess, uint256 amount)',
    'event Claimed(address indexed user, uint256 blockNum, bool won, uint256 payout)',
    'function placeBet(bytes1 _guess, uint256 _amount) external',
    'function claim(uint256 _blockNum) external',
    'function bets(address, uint256) external view returns (bytes1 guess, uint256 amount, bool claimed)',
    'function getContractBalance() external view returns (uint256)'
];

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    init();

    // 修复 100/500/1000 按钮
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
        document.getElementById('contractBalance').textContent = ` Purple pool: ${balance.toString()}`;
        console.log('Balance updated:', balance.toString());
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
    const val = parseInt(e.target.value);
    if (val > 10000) {
        alert('Maximum bet is 10,000 tokens');
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
            const required = selectedAmount * 12;
            if (balance < required) {
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
        const ethersProvider = new ethers.BrowserProvider(walletProvider);
        signer = await ethersProvider.getSigner();
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
                if (switchError.code === 4902 || switchError.code === -32603) { // Chain not added or error
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
                        // Retry switch after add
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
        if (allowance < selectedAmount) {
            await (await tokenContract.approve(contractAddress, ethers.MaxUint256)).wait();
        }

        const tx = await betContract.placeBet(ethers.toUtf8Bytes(selectedGuess)[0], selectedAmount);
        const receipt = await tx.wait();

        updateContractBalance();

        addLog(receipt.blockNumber, selectedGuess, selectedAmount);
    } catch (err) {
        console.error('Place bet error:', err.message);
    }
};

async function addLog(blockNum, guess, amount) {
    const logs = getLogs();
    logs.push({ blockNum, guess, amount, status: 'Pending' });
    saveLogs(logs);
    renderLogs();

    const interval = setInterval(async () => {
        try {
            const block = await provider.getBlock(blockNum);
            if (block && block.hash) {
                clearInterval(interval);
                const tx = await betContract.claim(blockNum);
                await tx.wait();
                updateLogStatus(blockNum, 'Claimed (Check wallet for reward)');
            }
        } catch (err) {
            console.error('Add log error:', err.message);
        }
    }, 2000);
}

function updateLogStatus(blockNum, status) {
    const logs = getLogs();
    const log = logs.find(l => l.blockNum === blockNum);
    if (log) {
        log.status = status;
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
        li.textContent = `Block: ${log.blockNum}, Guess: ${log.guess}, Amount: ${log.amount}, Status: ${log.status}`;
        if (log.highlight) li.classList.add('win');
        list.appendChild(li);
    });
}

function loadLogs() {
    renderLogs();
}
