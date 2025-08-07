const tokenAddress = '0xd642b49d10cc6e1bc1c6945725667c35e0875f22';  //purple合约地址
const contractAddress = 'CONTRACT_ADDRESS'; // 部署地址
const rpcUrl = 'https://rpc-gel.inkonchain.com';
const chainId = 57073;

const provider = new ethers.JsonRpcProvider(rpcUrl);
let signer, tokenContract, betContract;
let selectedGuess = '';
let selectedAmount = 0;

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

async function init() {
    const guesses = '0123456789abcdef'.split('');
    const guessButtons = document.getElementById('guessButtons');
    guesses.forEach(g => {
        const btn = document.createElement('button');
        btn.textContent = g;
        btn.onclick = () => {
            selectedGuess = g;
            updateBetButton();
        };
        guessButtons.appendChild(btn);
    });

    loadLogs();
    // 初始加载合约余额
    updateContractBalance();
}

async function updateContractBalance() {
    if (betContract) {
        const balance = await betContract.getContractBalance();
        document.getElementById('contractBalance').textContent = `合约 Purple 余额: ${balance.toString()}`;
    }
}

function setAmount(amount) {
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

    // 检查合约余额是否足够
    if (betContract && selectedAmount > 0) {
        const balance = await betContract.getContractBalance();
        const required = selectedAmount * 12;
        if (balance < required) {
            btn.disabled = true;
            alert('合约余额不足以支付潜在奖励 (需 > 12x 下注额)');
        }
    }
}

document.getElementById('connectWallet').onclick = async () => {
    if (!window.ethereum) return alert('Install MetaMask');

    try {
        await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
                chainId: `0x${chainId.toString(16)}`,
                chainName: 'Ink',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: [rpcUrl],
                blockExplorerUrls: ['https://explorer.inkonchain.com']
            }]
        });

        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        signer = await (new ethers.BrowserProvider(ethereum)).getSigner();
        const address = await signer.getAddress();
        document.getElementById('walletStatus').textContent = `Connected: ${address.slice(0,6)}...`;

        tokenContract = new ethers.Contract(tokenAddress, erc20Abi, signer);
        betContract = new ethers.Contract(contractAddress, betAbi, signer);

        updateBetButton();
        updateContractBalance(); // 连接后更新余额
        setupEventListeners();
    } catch (err) {
        console.error(err);
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

        // 下注后更新余额
        updateContractBalance();

        // 存储日志并开始自动 claim 轮询
        addLog(receipt.blockNumber, selectedGuess, selectedAmount);
    } catch (err) {
        console.error(err);
    }
};

function setupEventListeners() {
    betContract.on('BetPlaced', (user, blockNum, guess, amount) => {
        if (user.toLowerCase() === (signer.address.toLowerCase())) {
            addLog(blockNum, String.fromCharCode(guess), amount);
        }
    });

    betContract.on('Claimed', (user, blockNum, won, payout) => {
        if (user.toLowerCase() === (signer.address.toLowerCase())) {
            updateLogStatus(blockNum, won ? 'Win (Highlighted)' : 'Loss');
            updateContractBalance(); // 发放后更新余额
        }
    });
}

async function addLog(blockNum, guess, amount) {
    const logs = getLogs();
    logs.push({ blockNum, guess, amount, status: 'Pending' });
    saveLogs(logs);
    renderLogs();

    // 轮询 blockhash 并自动 claim (实现自动发放)
    const interval = setInterval(async () => {
        try {
            const block = await provider.getBlock(blockNum);
            if (block && block.hash) {
                clearInterval(interval);
                // 自动调用 claim
                const tx = await betContract.claim(blockNum);
                await tx.wait();
            }
        } catch (err) {
            console.error(err);
        }
    }, 2000); // 每 2 秒检查一次（INK 块速 ~1s）
}

function updateLogStatus(blockNum, status) {
    const logs = getLogs();
    const log = logs.find(l => l.blockNum === blockNum);
    if (log) {
        log.status = status;
        if (status.startsWith('Win')) log.highlight = true;
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

init();
