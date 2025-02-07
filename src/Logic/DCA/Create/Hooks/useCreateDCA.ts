import { useContext } from 'react';
import { useDispatch } from 'react-redux';
import { dcaVersion } from '../../../../Config/AppConfig';
import { nativeCurrencyAddresses } from '../../../../Config/ChainConfig';
import { APP, STATUS } from '../../../../Constants/AppConstants';
import { DCA_CONTRACTS } from '../../../../Constants/ContractHistory';
import { TrxType } from '../../../../Constants/enums';
import AuthContext from '../../../../Context/AuthContext';
import useAllowance from '../../../../Hooks/useAllowance';
import useApprove from '../../../../Hooks/useApprove';
import { setTrxType } from '../../../../Store/CommonReducer';
import { TokenTypes } from '../../../../Types';
import { getGasMultiplier } from '../../../../Utils/AppUtils';
import {
  initializeContract,
  parseUnitsInWei,
} from '../../../../Utils/ContractUtils';
import { parseJsonString } from '../../../../Utils/GeneralUtils';
import { errorNotification } from '../../../../Utils/NotificationUtils';
import {
  DCA_FORM_DEFAULT_VALUES,
  DCA_FORM_FIELD,
  INVESTMENT_CYCLE,
} from '../Constants';
import { DCATrxState } from '../Constants/enums';
import { setTrxResponse, setTrxState } from '../Store';

function useCreateDCA() {
  const { approve } = useApprove();
  const { getAllowance } = useAllowance();
  const { readWriteProvider, chainId, account, handleNetwork } =
    useContext(AuthContext);
  const gasMultiplier: [number, number] = getGasMultiplier(APP.dca, chainId);
  const dispatch = useDispatch();

  const getParams = async (formValue: any) => {
    const amount =
      formValue[DCA_FORM_FIELD.amount] || DCA_FORM_DEFAULT_VALUES.amount;
    const cycleKey =
      formValue[DCA_FORM_FIELD.cycle] || DCA_FORM_DEFAULT_VALUES.cycle;
    const period =
      formValue[DCA_FORM_FIELD.period] || DCA_FORM_DEFAULT_VALUES.period;
    const fromToken: TokenTypes = parseJsonString(
      formValue[DCA_FORM_FIELD.fromToken],
    );
    const toToken: TokenTypes = parseJsonString(
      formValue[DCA_FORM_FIELD.toToken],
    );
    const cycle = INVESTMENT_CYCLE[cycleKey].value * 86400;
    const contractAddress = DCA_CONTRACTS[dcaVersion][chainId];
    const abiPath = DCA_CONTRACTS[dcaVersion].abi;
    const params = [
      fromToken.contract,
      toToken.contract,
      '0x',
      parseUnitsInWei(amount, fromToken.decimals),
      period,
      cycle,
    ];
    let hasAllowance = true;
    const isNative = nativeCurrencyAddresses.includes(fromToken.contract);
    if (!isNative) {
      const { allowance } = await getAllowance(fromToken.contract);
      hasAllowance = allowance?.gt('0') || false;
    }
    const contract = initializeContract({
      contractAddress,
      abiPath,
      provider: readWriteProvider,
    });
    return {
      params,
      contract,
      hasAllowance,
      fromTokenContract: fromToken.contract,
      isNative,
    };
  };

  const createPosition = async (contract: any, params: any) => {
    try {
      dispatch(setTrxType(TrxType.blockchainWrite));
      const estimateGas = await contract.estimateGas.createPosition(...params);
      const result = await contract.createPosition(...params, {
        gasLimit: estimateGas.mul(gasMultiplier[0]).div(gasMultiplier[1]),
      });
      const res = await result.wait();
      dispatch(setTrxResponse({ status: STATUS.success, data: res }));
    } catch (error: any) {
      dispatch(setTrxResponse({ status: STATUS.error, data: error }));
      errorNotification('Error', error.message);
    }
  };

  const onSubmit = async (formValue: any) => {
    try {
      if (!account) {
        handleNetwork();
      } else {
        dispatch(setTrxResponse(undefined));
        dispatch(setTrxState(DCATrxState.wait));
        const { contract, params, hasAllowance, fromTokenContract } =
          await getParams(formValue);
        if (!hasAllowance) {
          dispatch(setTrxType(TrxType.approving));
          const res = await approve(fromTokenContract);
          if (res.status === STATUS.success) {
            createPosition(contract, params);
          } else {
            dispatch(setTrxResponse(res));
          }
        } else {
          createPosition(contract, params);
        }
      }
    } catch (err: any) {
      errorNotification('Error', err.message);
      //   return { status: STATUS.error, data: err };
    }
  };

  return {
    onSubmit,
  };
}
export default useCreateDCA;
